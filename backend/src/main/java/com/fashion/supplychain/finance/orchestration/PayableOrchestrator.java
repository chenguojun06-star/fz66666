package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.BillAggregation;
import com.fashion.supplychain.finance.entity.Payable;
import com.fashion.supplychain.finance.service.BillAggregationService;
import com.fashion.supplychain.finance.service.PayableService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 应付账款编排器
 * 镜像 ReceivableOrchestrator，处理 AP 创建、付款确认、逾期标记
 */
@Slf4j
@Service
public class PayableOrchestrator {

    @Autowired
    private PayableService payableService;

    @Autowired
    private BillAggregationService billAggregationService;

    private static final DateTimeFormatter NO_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final java.util.concurrent.atomic.AtomicInteger NO_SEQ = new java.util.concurrent.atomic.AtomicInteger(0);

    // ─── 查询 ────────────────────────────────────────────────────────────────

    public IPage<Payable> list(Map<String, Object> params) {
        int page     = parseInt(params.get("page"), 1);
        int pageSize = parseInt(params.get("pageSize"), 20);
        String supplierId = (String) params.get("supplierId");
        String status     = (String) params.get("status");
        String keyword    = (String) params.get("keyword");

        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        LambdaQueryWrapper<Payable> qw = new LambdaQueryWrapper<Payable>()
                .eq(Payable::getDeleteFlag, 0)
                .eq(Payable::getTenantId, tenantId)
                .eq(StringUtils.hasText(supplierId), Payable::getSupplierId, supplierId)
                .eq(StringUtils.hasText(status), Payable::getStatus, status)
                .and(StringUtils.hasText(keyword), w -> w
                        .like(Payable::getPayableNo, keyword)
                        .or().like(Payable::getSupplierName, keyword)
                        .or().like(Payable::getOrderNo, keyword))
                .orderByDesc(Payable::getCreateTime);

        return payableService.page(new Page<>(page, pageSize), qw);
    }

    public Payable getById(String id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        return payableService.lambdaQuery()
                .eq(Payable::getId, id)
                .eq(Payable::getTenantId, tenantId)
                .one();
    }

    public Payable findByBillAggregationId(String billAggregationId) {
        if (!StringUtils.hasText(billAggregationId)) {
            return null;
        }
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        return payableService.lambdaQuery()
                .eq(Payable::getBillAggregationId, billAggregationId)
                .eq(Payable::getDeleteFlag, 0)
                .eq(Payable::getTenantId, tenantId)
                .last("LIMIT 1")
                .one();
    }

    public Map<String, Object> getStats() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<Payable> all = payableService.list(
                new LambdaQueryWrapper<Payable>()
                        .eq(Payable::getDeleteFlag, 0)
                        .eq(Payable::getTenantId, tenantId)
                        .last("LIMIT 5000"));

        BigDecimal pendingAmount = BigDecimal.ZERO;
        BigDecimal overdueAmount = BigDecimal.ZERO;
        BigDecimal paidAmount = BigDecimal.ZERO;
        long overdueCount = 0;
        LocalDate today = LocalDate.now();
        LocalDate firstOfMonth = today.withDayOfMonth(1);

        for (Payable p : all) {
            BigDecimal remaining = (p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO)
                    .subtract(p.getPaidAmount() != null ? p.getPaidAmount() : BigDecimal.ZERO);
            if ("PENDING".equals(p.getStatus()) || "PARTIAL".equals(p.getStatus())) {
                pendingAmount = pendingAmount.add(remaining);
                if (p.getDueDate() != null && p.getDueDate().isBefore(today)) {
                    overdueAmount = overdueAmount.add(remaining);
                    overdueCount++;
                }
            } else if ("PAID".equals(p.getStatus())) {
                if (p.getCreateTime() != null
                        && p.getCreateTime().toLocalDate().compareTo(firstOfMonth) >= 0) {
                    paidAmount = paidAmount.add(p.getPaidAmount() != null ? p.getPaidAmount() : BigDecimal.ZERO);
                }
            }
        }

        long newThisMonth = all.stream()
                .filter(p -> p.getCreateTime() != null
                        && p.getCreateTime().toLocalDate().compareTo(firstOfMonth) >= 0)
                .count();

        Map<String, Object> stats = new HashMap<>();
        stats.put("pendingAmount", pendingAmount);
        stats.put("overdueAmount", overdueAmount);
        stats.put("overdueCount", overdueCount);
        stats.put("paidAmount", paidAmount);
        stats.put("newThisMonth", newThisMonth);
        return stats;
    }

    // ─── 写操作 ──────────────────────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public Payable create(Payable payable) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        UserContext ctx = UserContext.get();

        payable.setPayableNo("AP" + LocalDateTime.now().format(NO_FMT) + String.format("%03d", NO_SEQ.incrementAndGet() % 1000));
        payable.setTenantId(tenantId);
        payable.setDeleteFlag(0);
        payable.setStatus("PENDING");
        if (payable.getPaidAmount() == null) {
            payable.setPaidAmount(BigDecimal.ZERO);
        }
        if (ctx != null) {
            payable.setCreatorId(ctx.getUserId() == null ? null : String.valueOf(ctx.getUserId()));
            payable.setCreatorName(ctx.getUsername());
        }

        payableService.save(payable);
        log.info("[PayableOrchestrator] 新建应付单 {} 金额 {}", payable.getPayableNo(), payable.getAmount());
        return payable;
    }

    @Transactional(rollbackFor = Exception.class)
    public Payable generateFromOrder(String supplierId, String supplierName, String orderId,
                                     String orderNo, BigDecimal amount, LocalDate dueDate, String description) {
        Payable p = new Payable();
        p.setSupplierId(supplierId);
        p.setSupplierName(supplierName);
        p.setOrderId(orderId);
        p.setOrderNo(orderNo);
        p.setAmount(amount);
        p.setDueDate(dueDate);
        p.setDescription(description);
        return create(p);
    }

    @Transactional(rollbackFor = Exception.class)
    public Payable createFromBill(BillAggregation bill) {
        if (bill == null || !StringUtils.hasText(bill.getId())) {
            throw new RuntimeException("账单不存在，无法派生应付任务");
        }
        Payable existing = findByBillAggregationId(bill.getId());
        if (existing != null) {
            return existing;
        }
        Payable p = new Payable();
        p.setSupplierId(bill.getCounterpartyId());
        p.setSupplierName(bill.getCounterpartyName());
        p.setOrderId(bill.getOrderId());
        p.setOrderNo(StringUtils.hasText(bill.getOrderNo()) ? bill.getOrderNo() : bill.getSourceNo());
        p.setAmount(bill.getAmount() == null ? BigDecimal.ZERO : bill.getAmount());
        p.setPaidAmount(bill.getSettledAmount() == null ? BigDecimal.ZERO : bill.getSettledAmount());
        p.setDescription("账单派生: " + bill.getBillNo() + " / " + bill.getBillCategory());
        p.setBillAggregationId(bill.getId());
        return create(p);
    }

    @Transactional(rollbackFor = Exception.class)
    public Payable markPaid(String id, BigDecimal paymentAmount) {
        TenantAssert.assertTenantContext();
        Payable p = payableService.getById(id);
        if (p == null) throw new RuntimeException("应付单不存在");
        TenantAssert.assertBelongsToCurrentTenant(p.getTenantId(), "应付单");
        if ("PAID".equals(p.getStatus())) throw new RuntimeException("该应付单已结清，无法重复付款");

        // amount为null时默认结清全部剩余款项
        if (paymentAmount == null) {
            BigDecimal paid = p.getPaidAmount() != null ? p.getPaidAmount() : BigDecimal.ZERO;
            paymentAmount = p.getAmount().subtract(paid);
            if (paymentAmount.compareTo(BigDecimal.ZERO) <= 0) {
                throw new RuntimeException("该应付单已结清，无法重复付款");
            }
        }

        BigDecimal newPaid = (p.getPaidAmount() != null ? p.getPaidAmount() : BigDecimal.ZERO)
                .add(paymentAmount);
        p.setPaidAmount(newPaid);

        if (newPaid.compareTo(p.getAmount()) >= 0) {
            p.setStatus("PAID");
        } else {
            p.setStatus("PARTIAL");
        }

        payableService.updateById(p);
        syncBillAggregationAfterPayment(p, paymentAmount);
        log.info("[PayableOrchestrator] 应付单 {} 登记付款 {}，状态={}", id, paymentAmount, p.getStatus());
        return p;
    }

    private void syncBillAggregationAfterPayment(Payable payable, BigDecimal paymentAmount) {
        if (payable == null || !StringUtils.hasText(payable.getBillAggregationId())) {
            return;
        }
        BillAggregation bill = billAggregationService.getById(payable.getBillAggregationId());
        if (bill == null || bill.getDeleteFlag() == null || bill.getDeleteFlag() != 0) {
            return;
        }
        BigDecimal settled = bill.getSettledAmount() == null ? BigDecimal.ZERO : bill.getSettledAmount();
        BigDecimal add = paymentAmount == null ? BigDecimal.ZERO : paymentAmount;
        settled = settled.add(add);
        if (bill.getAmount() != null && settled.compareTo(bill.getAmount()) > 0) {
            settled = bill.getAmount();
        }
        bill.setSettledAmount(settled);
        if (bill.getAmount() != null && settled.compareTo(bill.getAmount()) >= 0) {
            bill.setStatus("SETTLED");
            bill.setSettledAt(LocalDateTime.now());
            bill.setSettledById(UserContext.userId());
            bill.setSettledByName(UserContext.username());
        } else {
            bill.setStatus("SETTLING");
        }
        billAggregationService.updateById(bill);
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(String id) {
        TenantAssert.assertTenantContext();
        payableService.removeById(id);
    }

    @Transactional(rollbackFor = Exception.class)
    public int markOverdue() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<Payable> list = payableService.list(
                new LambdaQueryWrapper<Payable>()
                        .eq(Payable::getDeleteFlag, 0)
                        .eq(Payable::getTenantId, tenantId)
                        .in(Payable::getStatus, "PENDING", "PARTIAL")
                        .lt(Payable::getDueDate, LocalDate.now()));
        int count = 0;
        for (Payable p : list) {
            p.setStatus("OVERDUE");
            payableService.updateById(p);
            count++;
        }
        if (count > 0) {
            log.info("[PayableOrchestrator] 批量标记逾期 {} 条", count);
        }
        return count;
    }

    private int parseInt(Object val, int def) {
        if (val == null) return def;
        try { return Integer.parseInt(val.toString()); } catch (Exception e) { return def; }
    }
}
