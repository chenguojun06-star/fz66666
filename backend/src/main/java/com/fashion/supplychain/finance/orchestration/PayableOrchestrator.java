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
import com.fashion.supplychain.finance.helper.PayableLogAppendHelper;
import java.util.NoSuchElementException;
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

    @Autowired
    private PayableLogAppendHelper logAppendHelper;

    /** 懒加载避免与 BillAggregationOrchestrator 循环依赖 */
    @Autowired
    @org.springframework.context.annotation.Lazy
    private com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator billAggregationOrchestrator;

    private static final DateTimeFormatter NO_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final java.util.concurrent.atomic.AtomicInteger NO_SEQ = new java.util.concurrent.atomic.AtomicInteger(0);

    // ─── 查询 ────────────────────────────────────────────────────────────────

    public IPage<Payable> list(Map<String, Object> params) {
        int page     = parseInt(params.get("page"), 1);
        int pageSize = parseInt(params.get("pageSize"), 20);
        String supplierId = (String) params.get("supplierId");
        String status     = (String) params.get("status");
        String keyword    = (String) params.get("keyword");
        String startDate  = (String) params.get("startDate");
        String endDate    = (String) params.get("endDate");
        // D-243：日期范围按到期日筛选时，due_date 为 NULL 的记录会被 ge/le 直接过滤掉，
        // 导致没填到期日的应付单在「计划付」里彻底不可见。该参数用于把它们一并纳入。
        boolean includeNoDueDate = Boolean.parseBoolean(String.valueOf(params.get("includeNoDueDate")));

        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // P0 修复（铁律4 多租户隔离）：工厂账号只能看到自己的应付账款
        // 与 WagePaymentDashboardHelper 保持一致，使用 counterpartyId=factoryId 或 supplierId=factoryId 过滤
        String ctxFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
        boolean isFactoryAccount = com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount();

        LambdaQueryWrapper<Payable> qw = new LambdaQueryWrapper<Payable>()
                .eq(Payable::getDeleteFlag, 0)
                .eq(Payable::getTenantId, tenantId)
                .eq(StringUtils.hasText(supplierId), Payable::getSupplierId, supplierId)
                .eq(StringUtils.hasText(status), Payable::getStatus, status)
                .and(StringUtils.hasText(keyword), w -> w
                        .like(Payable::getPayableNo, keyword)
                        .or().like(Payable::getSupplierName, keyword)
                        .or().like(Payable::getOrderNo, keyword))
                .and(isFactoryAccount && StringUtils.hasText(ctxFactoryId), w -> w
                        .eq(Payable::getCounterpartyId, ctxFactoryId)
                        .or().eq(Payable::getSupplierId, ctxFactoryId));

        // 日期范围筛选（按到期日 dueDate，更符合付款计划场景）
        boolean hasRange = StringUtils.hasText(startDate) || StringUtils.hasText(endDate);
        if (hasRange) {
            // 用 and(...) 包一层，保证 includeNoDueDate 的 OR 不会污染前面 tenantId / 工厂隔离等条件
            qw.and(w -> {
                if (StringUtils.hasText(startDate)) {
                    w.ge(Payable::getDueDate, parseLocalDate(startDate));
                }
                if (StringUtils.hasText(endDate)) {
                    w.le(Payable::getDueDate, parseLocalDate(endDate));
                }
                if (includeNoDueDate) {
                    w.or().isNull(Payable::getDueDate);
                }
            });
        }
        qw.orderByDesc(Payable::getCreateTime);

        return payableService.page(new Page<>(page, pageSize), qw);
    }

    /** 安全解析 LocalDate，解析失败返回 null */
    private LocalDate parseLocalDate(String s) {
        if (!StringUtils.hasText(s)) return null;
        try { return LocalDate.parse(s); } catch (Exception e) { return null; }
    }

    public Payable getById(String id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        return payableService.lambdaQuery()
                .eq(Payable::getId, id)
                .eq(Payable::getTenantId, tenantId)
                .eq(Payable::getDeleteFlag, 0)
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

        // P0 修复（铁律4 多租户隔离）：工厂账号 stats 与 list 数据范围对齐
        String ctxFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
        boolean isFactoryAccount = com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount();

        LambdaQueryWrapper<Payable> wrapper = new LambdaQueryWrapper<Payable>()
                .eq(Payable::getDeleteFlag, 0)
                .eq(Payable::getTenantId, tenantId)
                .and(isFactoryAccount && StringUtils.hasText(ctxFactoryId), w -> w
                        .eq(Payable::getCounterpartyId, ctxFactoryId)
                        .or().eq(Payable::getSupplierId, ctxFactoryId))
                .last("LIMIT 5000");
        List<Payable> all = payableService.list(wrapper);

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
        logAppendHelper.appendCreate(payable.getId(), payable.getAmount() != null ? payable.getAmount().toString() : "0");
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
        p.setBillType(bill.getBillType());
        p.setBillCategory(bill.getBillCategory());
        p.setSourceType(bill.getSourceType());
        p.setSourceId(bill.getSourceId());
        p.setSourceNo(bill.getSourceNo());
        p.setCounterpartyType(bill.getCounterpartyType());
        p.setCounterpartyId(bill.getCounterpartyId());
        p.setCounterpartyName(bill.getCounterpartyName());
        p.setStyleNo(bill.getStyleNo());
        p.setSettlementMonth(bill.getSettlementMonth());
        return create(p);
    }

    @Transactional(rollbackFor = Exception.class)
    /**
     * 反向账单时扣减合并应付：按 findMergedPayable 同构分组特征定位合并应付，
     * 未付款部分直接减去该账单金额（应付由 N 张账单合并而来，单张反向不能整单取消）。
     */
    public void reduceMergedPayableForReversedBill(BillAggregation bill, String reverseRemark) {
        try {
            Long tenantId = TenantAssert.requireTenantId();
            Payable merged = findMergedPayable(bill, tenantId);
            if (merged == null) return;
            BigDecimal paid = merged.getPaidAmount() != null ? merged.getPaidAmount() : BigDecimal.ZERO;
            BigDecimal amount = merged.getAmount() != null ? merged.getAmount() : BigDecimal.ZERO;
            BigDecimal billAmt = bill.getAmount() != null ? bill.getAmount() : BigDecimal.ZERO;
            // 已付部分优先冲抵：新应付 = max(amount - billAmt, paid)，避免扣成"已付>应付"
            BigDecimal newAmount = amount.subtract(billAmt).max(paid);
            if (newAmount.compareTo(amount) == 0) return;
            merged.setAmount(newAmount);
            int newCount = (merged.getBillCount() != null && merged.getBillCount() > 1) ? merged.getBillCount() - 1 : 0;
            merged.setBillCount(newCount);
            merged.setDescription((merged.getDescription() != null ? merged.getDescription() + " | " : "") + reverseRemark);
            if (paid.compareTo(newAmount) >= 0) {
                merged.setStatus("PAID");
            }
            merged.setUpdateTime(LocalDateTime.now());
            payableService.updateById(merged);
            log.info("[PayableOrchestrator] 反向账单扣减合并应付: payableNo={}, -{}, newTotal={}",
                    merged.getPayableNo(), billAmt, newAmount);
        } catch (Exception e) {
            log.warn("[PayableOrchestrator] 反向账单扣减合并应付失败(不阻断): billNo={}", bill.getBillNo(), e);
        }
    }

    public Payable findOrCreateMergedPayable(BillAggregation bill) {
        if (bill == null || !StringUtils.hasText(bill.getId())) {
            throw new RuntimeException("账单不存在，无法派生应付任务");
        }
        Long tenantId = TenantAssert.requireTenantId();
        String groupKey = buildMergeGroupKey(bill);

        Payable merged = findMergedPayable(bill, tenantId);
        if (merged != null) {
            BigDecimal addAmount = bill.getAmount() != null ? bill.getAmount() : BigDecimal.ZERO;
            merged.setAmount(merged.getAmount().add(addAmount));
            merged.setBillCount((merged.getBillCount() != null ? merged.getBillCount() : 1) + 1);
            merged.setDescription(merged.getBillCount() + "笔账单合并 - " + bill.getCounterpartyName()
                    + (StringUtils.hasText(bill.getSettlementMonth()) ? " (" + bill.getSettlementMonth() + ")" : ""));
            payableService.updateById(merged);
            log.info("[PayableOrchestrator] 合并应付单: payableNo={}, +{}, total={}, billCount={}",
                    merged.getPayableNo(), addAmount, merged.getAmount(), merged.getBillCount());
            logAppendHelper.appendMergeUpdate(merged.getId(),
                    addAmount != null ? addAmount.toString() : "0",
                    merged.getAmount() != null ? merged.getAmount().toString() : "0",
                    String.valueOf(merged.getBillCount()));
            return merged;
        }

        Payable p = new Payable();
        p.setSupplierId(bill.getCounterpartyId());
        p.setSupplierName(bill.getCounterpartyName());
        p.setCounterpartyType(bill.getCounterpartyType());
        p.setCounterpartyId(bill.getCounterpartyId());
        p.setCounterpartyName(bill.getCounterpartyName());
        p.setAmount(bill.getAmount() == null ? BigDecimal.ZERO : bill.getAmount());
        p.setPaidAmount(BigDecimal.ZERO);
        p.setBillType(bill.getBillType());
        p.setBillCategory(bill.getBillCategory());
        p.setSettlementMonth(bill.getSettlementMonth());
        p.setBillCount(1);
        p.setDescription("1笔账单合并 - " + bill.getCounterpartyName()
                + (StringUtils.hasText(bill.getSettlementMonth()) ? " (" + bill.getSettlementMonth() + ")" : ""));
        return create(p);
    }

    private Payable findMergedPayable(BillAggregation bill, Long tenantId) {
        // 注意：counterpartyId/settlementMonth 可能为空（如工资账单按订单聚合、无对手人），
        // eq(null) 会生成 "= NULL" 永假导致合并不生效、每笔新建应付——空值改用 isNull 匹配
        LambdaQueryWrapper<Payable> wrapper = new LambdaQueryWrapper<Payable>()
                .eq(Payable::getTenantId, tenantId)
                .eq(Payable::getDeleteFlag, 0)
                .in(Payable::getStatus, "PENDING", "PARTIAL")
                .eq(Payable::getBillType, bill.getBillType())
                .eq(Payable::getBillCategory, bill.getBillCategory());
        if (StringUtils.hasText(bill.getCounterpartyId())) {
            wrapper.eq(Payable::getCounterpartyId, bill.getCounterpartyId());
        } else {
            wrapper.isNull(Payable::getCounterpartyId);
        }
        if (StringUtils.hasText(bill.getSettlementMonth())) {
            wrapper.eq(Payable::getSettlementMonth, bill.getSettlementMonth());
        } else {
            wrapper.isNull(Payable::getSettlementMonth);
        }
        wrapper.last("LIMIT 1");
        return payableService.getOne(wrapper);
    }

    private String buildMergeGroupKey(BillAggregation bill) {
        return String.join("|",
                bill.getBillType() != null ? bill.getBillType() : "",
                bill.getBillCategory() != null ? bill.getBillCategory() : "",
                bill.getCounterpartyId() != null ? bill.getCounterpartyId() : "",
                bill.getSettlementMonth() != null ? bill.getSettlementMonth() : "");
    }

    @Transactional(rollbackFor = Exception.class)
    public Payable markPaid(String id, BigDecimal paymentAmount) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Payable p = payableService.lambdaQuery()
                .eq(Payable::getId, id)
                .eq(Payable::getTenantId, tenantId)
                .one();
        if (p == null) throw new RuntimeException("应付单不存在");
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
        logAppendHelper.appendMarkPaid(p.getId(), paymentAmount != null ? paymentAmount.toString() : "0", p.getStatus());
        return p;
    }

    private void syncBillAggregationAfterPayment(Payable payable, BigDecimal paymentAmount) {
        if (payable == null || !StringUtils.hasText(payable.getSourceType())
                || !StringUtils.hasText(payable.getSourceId())) {
            // 兼容旧逻辑：无 sourceType/sourceId 时回退到直接更新 BillAggregation
            syncBillAggregationAfterPaymentLegacy(payable, paymentAmount);
            return;
        }
        // P1 修复：使用官方 BillAggregationOrchestrator.syncSettledAmountBySource API
        // - 复用终态保护、日志审计、自动结清逻辑
        // - 与 EmployeeAdvanceOrchestrator.repay / MaterialPickupReceivableOrchestrator 保持一致
        if (billAggregationOrchestrator == null) {
            syncBillAggregationAfterPaymentLegacy(payable, paymentAmount);
            return;
        }
        try {
            BigDecimal newSettled = payable.getPaidAmount() != null ? payable.getPaidAmount() : BigDecimal.ZERO;
            billAggregationOrchestrator.syncSettledAmountBySource(
                    payable.getSourceType(), payable.getSourceId(), newSettled);
            log.info("[PayableOrchestrator] 付款联动账单 settledAmount: payableNo={}, sourceType={}, sourceId={}, settled={}",
                    payable.getPayableNo(), payable.getSourceType(), payable.getSourceId(), newSettled);
        } catch (Exception e) {
            log.warn("[PayableOrchestrator] 付款联动账单失败（不阻塞主流程）: payableNo={}, err={}",
                    payable.getPayableNo(), e.getMessage());
        }
    }

    /**
     * 旧逻辑兜底：无 sourceType/sourceId 时直接更新 BillAggregation 表
     * 仅用于兼容历史数据，新数据应通过 pushBill 派生 Payable 自动携带 sourceType/sourceId
     */
    private void syncBillAggregationAfterPaymentLegacy(Payable payable, BigDecimal paymentAmount) {
        if (payable == null || !StringUtils.hasText(payable.getBillAggregationId())) {
            return;
        }
        Long tenantId = UserContext.tenantId();
        BillAggregation bill = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getId, payable.getBillAggregationId())
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .one();
        if (bill == null) {
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
        Long tenantId = UserContext.tenantId();
        Payable existing = payableService.lambdaQuery()
                .eq(Payable::getId, id)
                .eq(Payable::getTenantId, tenantId)
                .eq(Payable::getDeleteFlag, 0)
                .one();
        if (existing == null) {
            throw new NoSuchElementException("应付单不存在");
        }
        Payable patch = new Payable();
        patch.setId(id);
        patch.setDeleteFlag(1);
        patch.setUpdateTime(java.time.LocalDateTime.now());
        payableService.updateById(patch);
        logAppendHelper.appendDelete(id);
    }

    /**
     * 反向账单联动：更新应付单状态（仅用于 BillAggregation.reverseBillInternal 联动调用）
     * 不走 markPaid 流程，仅回写状态和备注，保留财务痕迹
     */
    @Transactional(rollbackFor = Exception.class)
    public void updatePayableStatus(Payable payable) {
        if (payable == null || !StringUtils.hasText(payable.getId())) {
            return;
        }
        TenantAssert.assertTenantContext();
        Payable existing = payableService.lambdaQuery()
                .eq(Payable::getId, payable.getId())
                .eq(Payable::getTenantId, UserContext.tenantId())
                .eq(Payable::getDeleteFlag, 0)
                .one();
        if (existing == null) {
            log.warn("[PayableOrchestrator] 反向联动更新失败：应付单不存在: id={}", payable.getId());
            return;
        }
        payableService.updateById(payable);
        log.info("[PayableOrchestrator] 反向联动状态更新: payableNo={}, newStatus={}",
                existing.getPayableNo(), payable.getStatus());
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
        int count = list.size();
        if (count > 0) {
            payableService.lambdaUpdate()
                    .eq(Payable::getDeleteFlag, 0)
                    .eq(Payable::getTenantId, tenantId)
                    .in(Payable::getStatus, "PENDING", "PARTIAL")
                    .lt(Payable::getDueDate, LocalDate.now())
                    .set(Payable::getStatus, "OVERDUE")
                    .update();
            log.info("[PayableOrchestrator] 批量标记逾期 {} 条", count);
        }
        return count;
    }

    private int parseInt(Object val, int def) {
        if (val == null) return def;
        try { return Integer.parseInt(val.toString()); } catch (Exception e) { return def; }
    }
}
