package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.Payable;
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

    private static final DateTimeFormatter NO_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    // ─── 查询 ────────────────────────────────────────────────────────────────

    public IPage<Payable> list(Map<String, Object> params) {
        int page     = parseInt(params.get("page"), 1);
        int pageSize = parseInt(params.get("pageSize"), 20);
        String supplierId = (String) params.get("supplierId");
        String status     = (String) params.get("status");
        String keyword    = (String) params.get("keyword");

        Long tenantId = UserContext.tenantId();

        LambdaQueryWrapper<Payable> qw = new LambdaQueryWrapper<Payable>()
                .eq(Payable::getDeleteFlag, 0)
                .eq(tenantId != null, Payable::getTenantId, tenantId)
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
        return payableService.getById(id);
    }

    public Map<String, Object> getStats() {
        Long tenantId = UserContext.tenantId();
        List<Payable> all = payableService.list(
                new LambdaQueryWrapper<Payable>()
                        .eq(Payable::getDeleteFlag, 0)
                        .eq(tenantId != null, Payable::getTenantId, tenantId));

        BigDecimal totalPending = BigDecimal.ZERO;
        BigDecimal totalOverdue = BigDecimal.ZERO;
        long overdueCount = 0;
        LocalDate today = LocalDate.now();
        LocalDate firstOfMonth = today.withDayOfMonth(1);

        for (Payable p : all) {
            BigDecimal remaining = p.getAmount().subtract(
                    p.getPaidAmount() != null ? p.getPaidAmount() : BigDecimal.ZERO);
            if ("PENDING".equals(p.getStatus()) || "PARTIAL".equals(p.getStatus())) {
                totalPending = totalPending.add(remaining);
                if (p.getDueDate() != null && p.getDueDate().isBefore(today)) {
                    totalOverdue = totalOverdue.add(remaining);
                    overdueCount++;
                }
            }
        }

        long newThisMonth = all.stream()
                .filter(p -> p.getCreateTime() != null
                        && p.getCreateTime().toLocalDate().compareTo(firstOfMonth) >= 0)
                .count();

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalPending", totalPending);
        stats.put("totalOverdue", totalOverdue);
        stats.put("overdueCount", overdueCount);
        stats.put("newThisMonth", newThisMonth);
        return stats;
    }

    // ─── 写操作 ──────────────────────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public Payable create(Payable payable) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        UserContext ctx = UserContext.get();

        payable.setPayableNo("AP" + LocalDateTime.now().format(NO_FMT));
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
    public Payable markPaid(String id, BigDecimal paymentAmount) {
        TenantAssert.assertTenantContext();
        Payable p = payableService.getById(id);
        if (p == null) throw new RuntimeException("应付单不存在");
        if ("PAID".equals(p.getStatus())) throw new RuntimeException("该应付单已结清，无法重复付款");

        BigDecimal newPaid = (p.getPaidAmount() != null ? p.getPaidAmount() : BigDecimal.ZERO)
                .add(paymentAmount);
        p.setPaidAmount(newPaid);

        if (newPaid.compareTo(p.getAmount()) >= 0) {
            p.setStatus("PAID");
        } else {
            p.setStatus("PARTIAL");
        }

        payableService.updateById(p);
        log.info("[PayableOrchestrator] 应付单 {} 登记付款 {}，状态={}", id, paymentAmount, p.getStatus());
        return p;
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(String id) {
        TenantAssert.assertTenantContext();
        Payable p = new Payable();
        p.setId(id);
        p.setDeleteFlag(1);
        payableService.updateById(p);
    }

    @Transactional(rollbackFor = Exception.class)
    public int markOverdue() {
        TenantAssert.assertTenantContext();
        List<Payable> list = payableService.list(
                new LambdaQueryWrapper<Payable>()
                        .eq(Payable::getDeleteFlag, 0)
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
