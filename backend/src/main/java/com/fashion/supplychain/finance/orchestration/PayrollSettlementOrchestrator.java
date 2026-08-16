package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.entity.PayrollSettlementItem;
import com.fashion.supplychain.finance.entity.DeductionItem;
import com.fashion.supplychain.finance.helper.PayrollSettlementLogAppendHelper;
import com.fashion.supplychain.finance.mapper.DeductionItemMapper;
import com.fashion.supplychain.finance.service.PayrollSettlementItemService;
import com.fashion.supplychain.finance.service.PayrollSettlementService;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator.BillPushRequest;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class PayrollSettlementOrchestrator {

    @Autowired
    private PayrollSettlementService payrollSettlementService;

    @Autowired
    private PayrollSettlementItemService payrollSettlementItemService;

    @Autowired
    private ScanRecordMapper scanRecordMapper;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private BillAggregationOrchestrator billAggregationOrchestrator;

    @Autowired
    private DeductionItemMapper deductionItemMapper;

    @Autowired
    private PayrollSettlementLogAppendHelper logAppendHelper;

    @Autowired(required = false)
    private com.fashion.supplychain.common.lock.DistributedLockService distributedLockService;

    @Autowired
    private PayrollSettlementQueryHelper queryHelper;

    @Autowired
    private PayrollSettlementItemBuilderHelper itemBuilder;

    @Autowired
    private PayrollSettlementTrackingHelper trackingHelper;

    private static final List<String> PAYROLL_SCAN_TYPES = List.of("production", "cutting", "pattern");

    public IPage<PayrollSettlement> list(Map<String, Object> params) {
        // 工厂账号隔离：只能查看本工厂订单的工资结算
        java.util.List<String> factoryOrderIds = com.fashion.supplychain.common.DataPermissionHelper
                .getFactoryOrderIds(productionOrderService);
        if (factoryOrderIds != null && factoryOrderIds.isEmpty()) {
            return new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>();
        }
        if (factoryOrderIds != null) {
            java.util.Map<String, Object> mutable = new java.util.HashMap<>(params != null ? params : new java.util.HashMap<>());
            mutable.put("_factoryOrderIds", factoryOrderIds);
            return payrollSettlementService.queryPage(mutable);
        }
        return payrollSettlementService.queryPage(params);
    }

    public PayrollSettlement detail(String id) {
        TenantAssert.assertTenantContext();
        String sid = TextUtils.safeText(id);
        if (!StringUtils.hasText(sid)) {
            throw new IllegalArgumentException("参数错误");
        }
        Long tenantId = UserContext.tenantId();
        PayrollSettlement settlement = payrollSettlementService.lambdaQuery()
                .eq(PayrollSettlement::getId, sid)
                .eq(PayrollSettlement::getTenantId, tenantId)
                .one();
        if (settlement == null) {
            throw new NoSuchElementException("工资结算单不存在");
        }
        return settlement;
    }

    public List<PayrollSettlementItem> items(String settlementId) {
        TenantAssert.assertTenantContext();
        String sid = TextUtils.safeText(settlementId);
        if (!StringUtils.hasText(sid)) {
            throw new IllegalArgumentException("参数错误");
        }
        Long tenantId = UserContext.tenantId();
        PayrollSettlement settlement = payrollSettlementService.lambdaQuery()
                .eq(PayrollSettlement::getId, sid)
                .eq(PayrollSettlement::getTenantId, tenantId)
                .one();
        if (settlement == null) {
            throw new NoSuchElementException("工资结算单不存在");
        }
        // 显式带 tenant_id 查询明细（双保险）
        return payrollSettlementItemService.lambdaQuery()
                .eq(PayrollSettlementItem::getSettlementId, sid)
                .eq(PayrollSettlementItem::getTenantId, tenantId)
                .orderByAsc(PayrollSettlementItem::getOperatorName)
                .orderByAsc(PayrollSettlementItem::getProcessName)
                .list();
    }

    public List<Map<String, Object>> operatorSummary(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        PayrollSettlementQuery q = queryHelper.parseQuery(params, true, true);

        if (UserContext.isWorker()) {
            String currentUserId = UserContext.userId();
            if (org.springframework.util.StringUtils.hasText(currentUserId)) {
                q.setOperatorId(currentUserId);
                log.debug("[工资查询] 员工权限限制: userId={} 只能查看自己的工资记录", currentUserId);
            }
        }

        List<String> effectiveScanTypes = StringUtils.hasText(q.getScanType()) ? null : PAYROLL_SCAN_TYPES;

        List<Map<String, Object>> rows = scanRecordMapper.selectPayrollAggregation(
                q.getOrderId(),
                q.getOrderNo(),
                q.getStyleNo(),
                q.getOperatorId(),
                q.getOperatorName(),
                q.getScanType(),
                effectiveScanTypes,
                q.getProcessName(),
                q.getStartTime(),
                q.getEndTime(),
                q.isIncludeSettled(),
                com.fashion.supplychain.common.UserContext.tenantId());

        if (rows == null) {
            return List.of();
        }

        Map<String, Map<String, String>> orderNoToProcessCodeMap = itemBuilder.buildProcessCodeMapFromRows(rows);

        for (Map<String, Object> row : rows) {
            if (row == null) {
                continue;
            }
            Integer qty = PayrollSettlementQueryHelper.toInt(row.get("quantity"));
            BigDecimal amount = PayrollSettlementQueryHelper.toBigDecimal(row.get("totalAmount"));
            if (qty == null) {
                qty = 0;
            }
            if (amount == null) {
                amount = BigDecimal.ZERO;
            }
            // P1 修复（工资链路断点5）：优先直读 SQL 返回的 unitPrice（process_unit_price 优先，unit_price 兜底）
            // 避免反推 amount/qty 的精度损失（如 3.33×3=9.99，反推得 3.33，但 3.333×3=9.999 取整后反推得 3.33 损失精度）
            BigDecimal storedUnitPrice = PayrollSettlementQueryHelper.toBigDecimal(row.get("unitPrice"));
            BigDecimal up;
            if (storedUnitPrice != null && storedUnitPrice.compareTo(BigDecimal.ZERO) > 0) {
                up = storedUnitPrice;
            } else if (qty > 0) {
                up = amount.divide(BigDecimal.valueOf(qty), 2, RoundingMode.HALF_UP);
            } else {
                up = BigDecimal.ZERO;
            }
            row.put("unitPrice", up);

            String processCode = TextUtils.safeText(row.get("processCode"));
            String processName = TextUtils.safeText(row.get("processName"));
            if ((processCode.isEmpty() || processCode.equals(processName)) && !processName.isEmpty()) {
                String orderNo = TextUtils.safeText(row.get("orderNo"));
                Map<String, String> nameToCode = orderNoToProcessCodeMap.get(orderNo);
                if (nameToCode != null) {
                    String resolved = nameToCode.get(processName.trim());
                    if (resolved != null) row.put("processCode", resolved);
                }
            }
        }

        return rows;
    }

    @Transactional(rollbackFor = Exception.class)
    public PayrollSettlement generate(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        if (!UserContext.isSupervisorOrAbove()) {
            throw new org.springframework.security.access.AccessDeniedException("仅主管及以上可生成工资结算单");
        }
        PayrollSettlementQuery q = queryHelper.parseQuery(params, false, false);
        if (!StringUtils.hasText(q.getOrderId()) && !StringUtils.hasText(q.getOrderNo())
                && q.getStartTime() == null && q.getEndTime() == null) {
            throw new IllegalArgumentException("参数错误");
        }

        // P0-9: 分布式锁防止并发生成同一维度的工资结算单
        Long tenantId = UserContext.tenantId();
        String lockKey = "payroll:generate:" + tenantId + ":" + q.getOrderId() + ":" + q.getOperatorId();
        if (distributedLockService != null) {
            return distributedLockService.executeWithLock(lockKey, 30, java.util.concurrent.TimeUnit.SECONDS,
                    () -> doGenerate(q));
        }
        return doGenerate(q);
    }

    private PayrollSettlement doGenerate(PayrollSettlementQuery q) {
        List<Map<String, Object>> rows = scanRecordMapper.selectPayrollAggregation(
                q.getOrderId(), q.getOrderNo(), q.getStyleNo(), q.getOperatorId(), q.getOperatorName(),
                q.getScanType(), PAYROLL_SCAN_TYPES, q.getProcessName(),
                q.getStartTime(), q.getEndTime(), q.isIncludeSettled(),
                com.fashion.supplychain.common.UserContext.tenantId());

        if (rows == null || rows.isEmpty()) {
            throw new IllegalStateException("无可结算扫码记录");
        }

        PayrollSettlement settlement = itemBuilder.buildSettlement(q);
        List<PayrollSettlementItem> items = itemBuilder.buildSettlementItems(rows, settlement);
        settlement.setTotalQuantity(items.stream().mapToInt(i -> Math.max(0, i.getQuantity() == null ? 0 : i.getQuantity())).sum());
        settlement.setTotalAmount(items.stream().map(PayrollSettlementItem::getTotalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP));
        settlement.setPaidAmount(BigDecimal.ZERO);
        settlement.setRemainingAmount(settlement.getTotalAmount());
        settlement.setDeductionAmount(BigDecimal.ZERO);
        settlement.setAdvanceAmount(BigDecimal.ZERO);
        settlement.setPaymentStatus("unpaid");

        payrollSettlementService.save(settlement);
        for (PayrollSettlementItem item : items) {
            item.setSettlementId(settlement.getId());
        }
        payrollSettlementItemService.saveBatch(items);
        trackingHelper.markScanRecordsAsSettled(q, settlement.getId());

        log.info("[PayrollGenerate] 生成工资结算单: operator={}, settlementId={}, settlementNo={}, orderId={}, orderNo={}, totalQty={}, totalAmount={}",
                UserContext.username(), settlement.getId(), settlement.getSettlementNo(), q.getOrderId(), q.getOrderNo(),
                settlement.getTotalQuantity(), settlement.getTotalAmount());
        logAppendHelper.appendCreate(settlement, UserContext.username());
        return settlement;
    }

    /**
     * 审核通过工资结算单
     * 只允许审核 pending 状态的结算单，标记已扫码记录 payrollSettled=true
     *
     * @param settlementId 结算单ID
     * @param remark       审核备注（可选）
     */
    @Transactional(rollbackFor = Exception.class)
    public void approve(String settlementId, String remark) {
        TenantAssert.assertTenantContext();
        if (!StringUtils.hasText(settlementId)) {
            throw new IllegalArgumentException("结算单ID不能为空");
        }
        Long tenantId = UserContext.tenantId();
        PayrollSettlement settlement = payrollSettlementService.lambdaQuery()
                .eq(PayrollSettlement::getId, settlementId.trim())
                .eq(PayrollSettlement::getTenantId, tenantId)
                .one();
        if (settlement == null) {
            throw new NoSuchElementException("结算单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(settlement.getTenantId(), "工资结算单");
        if (!"pending".equalsIgnoreCase(settlement.getStatus())) {
            throw new IllegalStateException("当前状态不允许审核，只有待审核(pending)状态可以审核通过");
        }

        LocalDateTime now = LocalDateTime.now();
        String confirmerId = null;
        String confirmerName = null;
        UserContext ctx = UserContext.get();
        if (ctx != null) {
            confirmerId = StringUtils.hasText(ctx.getUserId()) ? ctx.getUserId().trim() : null;
            confirmerName = ctx.getUsername();
        }

        LambdaUpdateWrapper<PayrollSettlement> uw = new LambdaUpdateWrapper<PayrollSettlement>()
                .set(PayrollSettlement::getStatus, "approved")
                .set(PayrollSettlement::getConfirmerId, confirmerId)
                .set(PayrollSettlement::getConfirmerName, confirmerName)
                .set(PayrollSettlement::getConfirmTime, now)
                .set(PayrollSettlement::getUpdateTime, now)
                .eq(PayrollSettlement::getId, settlementId.trim());
        if (StringUtils.hasText(remark)) {
            uw.set(PayrollSettlement::getRemark, remark.trim());
        }
        payrollSettlementService.update(uw);

        logAppendHelper.appendApprove(settlement, confirmerName);

        // 确认关联扫码记录的结算状态（payrollSettlementId 已在 generate() 时绑定）
        // 审核通过后 payrollSettlementId 保持不变，undo 操作会据此阻止撤回
        LambdaUpdateWrapper<ScanRecord> scanUw = new LambdaUpdateWrapper<ScanRecord>()
                .set(ScanRecord::getSettlementStatus, "payroll_approved")
                .set(ScanRecord::getUpdateTime, now)
                .eq(ScanRecord::getPayrollSettlementId, settlementId.trim())
                .eq(ScanRecord::getTenantId, tenantId)
                // P0: 双重保险，排除外发工厂扫码（generate 已过滤，此处对齐）
                .isNull(ScanRecord::getFactoryId);
        scanRecordMapper.update(new ScanRecord(), scanUw);

        log.info("[PayrollApprove] 工资结算单审核通过: id={}, confirmerId={}", settlementId, confirmerId);

        if (billAggregationOrchestrator != null) {
            BillPushRequest pushReq = new BillPushRequest();
            pushReq.setBillType("PAYABLE");
            pushReq.setBillCategory("PAYROLL");
            pushReq.setSourceType("PAYROLL_SETTLEMENT");
            pushReq.setSourceId(settlementId.trim());
            pushReq.setSourceNo(settlement.getSettlementNo());
            pushReq.setCounterpartyType("WORKER");
            pushReq.setOrderId(settlement.getOrderId());
            pushReq.setOrderNo(settlement.getOrderNo());
            pushReq.setStyleNo(settlement.getStyleNo());
            pushReq.setAmount(settlement.getTotalAmount());
            pushReq.setSettlementMonth(now.format(DateTimeFormatter.ofPattern("yyyy-MM")));
            billAggregationOrchestrator.pushBill(pushReq);
        }
    }

    /**
     * 反向审核工资结算单
     * 只允许 approved 状态的结算单进行反向审核，将状态改回 pending，
     * 同时将关联扫码记录的 settlementStatus 从 payroll_approved 改回 payroll_settled，
     * 并联动反向已推送的账单。
     *
     * @param settlementId 结算单ID
     * @param reason       反向审核原因
     */
    @Transactional(rollbackFor = Exception.class)
    public void reverseApprove(String settlementId, String reason) {
        TenantAssert.assertTenantContext();
        if (!StringUtils.hasText(settlementId)) {
            throw new IllegalArgumentException("结算单ID不能为空");
        }
        Long tenantId = UserContext.tenantId();
        PayrollSettlement settlement = payrollSettlementService.lambdaQuery()
                .eq(PayrollSettlement::getId, settlementId.trim())
                .eq(PayrollSettlement::getTenantId, tenantId)
                .one();
        if (settlement == null) {
            throw new NoSuchElementException("结算单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(settlement.getTenantId(), "工资结算单");
        if (!"approved".equalsIgnoreCase(settlement.getStatus())) {
            throw new IllegalStateException("仅 approved 状态可反向审核");
        }

        LocalDateTime now = LocalDateTime.now();
        String operatorName = UserContext.username();

        // 1. 状态回退：approved -> pending
        LambdaUpdateWrapper<PayrollSettlement> uw = new LambdaUpdateWrapper<PayrollSettlement>()
                .set(PayrollSettlement::getStatus, "pending")
                .set(PayrollSettlement::getUpdateTime, now)
                .eq(PayrollSettlement::getId, settlementId.trim());
        payrollSettlementService.update(uw);

        // 2. 关联扫码记录 settlementStatus: payroll_approved -> payroll_settled
        LambdaUpdateWrapper<ScanRecord> scanUw = new LambdaUpdateWrapper<ScanRecord>()
                .set(ScanRecord::getSettlementStatus, "payroll_settled")
                .set(ScanRecord::getUpdateTime, now)
                .eq(ScanRecord::getPayrollSettlementId, settlementId.trim())
                .eq(ScanRecord::getSettlementStatus, "payroll_approved")
                .eq(ScanRecord::getTenantId, tenantId)
                .isNull(ScanRecord::getFactoryId);
        scanRecordMapper.update(new ScanRecord(), scanUw);

        // 2.1 P0 修复：回滚 tracking 表结算状态（与 ScanRecord 状态同步）
        trackingHelper.rollbackTrackingSettlementState(settlement);

        log.info("[PayrollReverseApprove] 工资结算单反向审核: operator={}, settlementId={}, settlementNo={}, reason={}",
                operatorName, settlement.getId(), settlement.getSettlementNo(), reason);

        // 3. 联动反向账单（已结清账单会抛异常，需提示用户先冲账）
        try {
            if (billAggregationOrchestrator != null) {
                billAggregationOrchestrator.reverseBySource("PAYROLL_SETTLEMENT",
                        settlementId.trim(), "工资结算反向审核: " + (reason == null ? "" : reason));
            }
        } catch (Exception e) {
            log.warn("[PayrollReverseApprove] 账单反向失败（可能存在已结清账单需手动冲账）: settlementId={}, err={}",
                    settlementId, e.getMessage());
            throw new IllegalStateException("账单反向失败，可能存在已结清账单，请先冲账后再反向审核: " + e.getMessage(), e);
        }
    }

    /**
     * 取消工资结算单
     * 只允许取消 pending 状态的结算单，取消后释放已关联的扫码记录
     *
     * @param settlementId 结算单ID
     * @param remark       取消原因
     */
    @Transactional(rollbackFor = Exception.class)
    public void cancel(String settlementId, String remark) {
        TenantAssert.assertTenantContext();
        if (!StringUtils.hasText(settlementId)) {
            throw new IllegalArgumentException("结算单ID不能为空");
        }
        Long tenantId = UserContext.tenantId();
        PayrollSettlement settlement = payrollSettlementService.lambdaQuery()
                .eq(PayrollSettlement::getId, settlementId.trim())
                .eq(PayrollSettlement::getTenantId, tenantId)
                .one();
        if (settlement == null) {
            throw new NoSuchElementException("结算单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(settlement.getTenantId(), "工资结算单");
        if (!"pending".equalsIgnoreCase(settlement.getStatus())) {
            throw new IllegalStateException("当前状态不允许取消，只有待审核(pending)状态可以取消");
        }

        // 更新结算单状态为 cancelled
        LambdaUpdateWrapper<PayrollSettlement> settlementUw = new LambdaUpdateWrapper<PayrollSettlement>()
                .set(PayrollSettlement::getStatus, "cancelled")
                .set(PayrollSettlement::getUpdateTime, LocalDateTime.now())
                .eq(PayrollSettlement::getId, settlementId.trim());
        payrollSettlementService.update(settlementUw);

        logAppendHelper.appendCancel(settlement, UserContext.username());

        LambdaUpdateWrapper<ScanRecord> scanUw = new LambdaUpdateWrapper<ScanRecord>()
                .set(ScanRecord::getPayrollSettlementId, null)
                .set(ScanRecord::getSettlementStatus, null)
                .set(ScanRecord::getUpdateTime, LocalDateTime.now())
                .eq(ScanRecord::getPayrollSettlementId, settlementId.trim())
                .eq(ScanRecord::getTenantId, settlement.getTenantId());
        scanRecordMapper.update(new ScanRecord(), scanUw);

        // P0 修复：回滚 tracking 表结算状态，避免"已结算不可撤回"校验永久悬挂
        trackingHelper.rollbackTrackingSettlementState(settlement);

        log.info("[PayrollCancel] 取消工资结算单: operator={}, settlementId={}, settlementNo={}, totalAmount={}, remark={}",
                UserContext.username(), settlement.getId(), settlement.getSettlementNo(), settlement.getTotalAmount(), remark);

        try {
            if (billAggregationOrchestrator != null) {
                // P0 财务闭环修复：改用 reverseBySource 联动反向全链路（Bill → Payable/Receivable）
                // 原 cancelBySource 仅取消未结清账单，不联动 Payable/Receivable，导致工资取消后应付记录悬挂
                billAggregationOrchestrator.reverseBySource("PAYROLL_SETTLEMENT",
                        settlementId.trim(), "工资结算取消");
            }
        } catch (Exception e) {
            log.warn("工资结算取消联动账单反向失败（不影响主流程）: settlementId={}, err={}", settlementId, e.getMessage());
        }
    }

    /**
     * 删除工资结算单
     * 只允许删除 cancelled 状态的结算单，同时删除明细
     *
     * @param settlementId 结算单ID
     */
    @Transactional(rollbackFor = Exception.class)
    public void delete(String settlementId) {
        TenantAssert.assertTenantContext();
        if (!StringUtils.hasText(settlementId)) {
            throw new IllegalArgumentException("结算单ID不能为空");
        }
        Long tenantId = UserContext.tenantId();
        PayrollSettlement settlement = payrollSettlementService.lambdaQuery()
                .eq(PayrollSettlement::getId, settlementId.trim())
                .eq(PayrollSettlement::getTenantId, tenantId)
                .one();
        if (settlement == null) {
            throw new NoSuchElementException("结算单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(settlement.getTenantId(), "工资结算单");
        if (!"cancelled".equalsIgnoreCase(settlement.getStatus())) {
            throw new IllegalStateException("只允许删除已取消(cancelled)的结算单，请先取消");
        }

        log.info("[PayrollDelete] 删除工资结算单: operator={}, settlementId={}, settlementNo={}, orderId={}, orderNo={}, totalAmount={}",
                UserContext.username(), settlement.getId(), settlement.getSettlementNo(), settlement.getOrderId(),
                settlement.getOrderNo(), settlement.getTotalAmount());

        // 先删明细，再删主记录
        payrollSettlementItemService.deleteBySettlementId(settlementId.trim());

        // P0 修复：删除前回滚 tracking 结算状态（cancelled 状态可能仍悬挂 tracking.isSettled）
        trackingHelper.rollbackTrackingSettlementState(settlement);

        payrollSettlementService.removeById(settlementId.trim());
    }

    @Transactional(rollbackFor = Exception.class)
    public void recordPayment(String settlementId, BigDecimal paymentAmount) {
        TenantAssert.assertTenantContext();
        if (!StringUtils.hasText(settlementId)) {
            throw new IllegalArgumentException("结算单ID不能为空");
        }
        if (paymentAmount == null || paymentAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("打款金额必须大于0");
        }
        Long tenantId = UserContext.tenantId();
        PayrollSettlement settlement = payrollSettlementService.lambdaQuery()
                .eq(PayrollSettlement::getId, settlementId.trim())
                .eq(PayrollSettlement::getTenantId, tenantId)
                .one();
        if (settlement == null) {
            throw new NoSuchElementException("结算单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(settlement.getTenantId(), "工资结算单");
        if (!"approved".equalsIgnoreCase(settlement.getStatus())) {
            throw new IllegalStateException("只有已审核(approved)的结算单可打款");
        }

        BigDecimal currentPaid = settlement.getPaidAmount() != null ? settlement.getPaidAmount() : BigDecimal.ZERO;
        BigDecimal currentRemaining = settlement.getRemainingAmount() != null ? settlement.getRemainingAmount() : settlement.getTotalAmount();
        if (paymentAmount.compareTo(currentRemaining) > 0) {
            throw new IllegalArgumentException("打款金额不能超过剩余未付金额: " + currentRemaining);
        }

        int rows = payrollSettlementService.atomicAddPaidAmount(settlementId.trim(), paymentAmount, currentPaid, tenantId);
        if (rows == 0) {
            throw new OptimisticLockingFailureException("工资打款并发冲突，请重试: settlementId=" + settlementId);
        }

        log.info("[PayrollPayment] 工资打款记录: settlementId={}, paymentAmount={}, previousPaid={}",
                settlementId, paymentAmount, currentPaid);
        logAppendHelper.appendPayment(settlement, paymentAmount, UserContext.username());

        // P0 修复：打款联动 BillAggregation 聚合层 settledAmount
        // - 与 EmployeeAdvanceOrchestrator.repay 保持一致
        // - 否则聚合视图已结算金额与明细不一致，违反财务数据链路闭环
        if (billAggregationOrchestrator != null) {
            try {
                BigDecimal newPaid = currentPaid.add(paymentAmount);
                billAggregationOrchestrator.syncSettledAmountBySource(
                        "PAYROLL_SETTLEMENT", settlementId.trim(), newPaid);
                log.info("[PayrollPayment] 联动账单 settledAmount: settlementId={}, newPaid={}",
                        settlementId, newPaid);
            } catch (Exception e) {
                log.warn("[PayrollPayment] 联动账单失败（不阻塞主流程）: settlementId={}, err={}",
                        settlementId, e.getMessage());
            }
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void applyDeduction(String settlementId, BigDecimal deductionAmount, String deductionType, String description) {
        TenantAssert.assertTenantContext();
        if (!StringUtils.hasText(settlementId)) {
            throw new IllegalArgumentException("结算单ID不能为空");
        }
        if (deductionAmount == null || deductionAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("扣款金额必须大于0");
        }
        Long tenantId = UserContext.tenantId();
        PayrollSettlement settlement = payrollSettlementService.lambdaQuery()
                .eq(PayrollSettlement::getId, settlementId.trim())
                .eq(PayrollSettlement::getTenantId, tenantId)
                .one();
        if (settlement == null) {
            throw new NoSuchElementException("结算单不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(settlement.getTenantId(), "工资结算单");

        BigDecimal currentDeduction = settlement.getDeductionAmount() != null ? settlement.getDeductionAmount() : BigDecimal.ZERO;

        DeductionItem deduction = new DeductionItem();
        deduction.setSettlementId(settlementId.trim());
        deduction.setDeductionType(deductionType);
        deduction.setDeductionAmount(deductionAmount);
        deduction.setDescription(description);
        deduction.setSourceType("PAYROLL_SETTLEMENT");
        deduction.setSourceId(settlementId.trim());
        deduction.setTenantId(com.fashion.supplychain.common.UserContext.tenantId());
        deductionItemMapper.insert(deduction);

        int rows = payrollSettlementService.atomicAddDeductionAmount(settlementId.trim(), deductionAmount, currentDeduction, tenantId);
        if (rows == 0) {
            throw new OptimisticLockingFailureException("工资扣款并发冲突，请重试: settlementId=" + settlementId);
        }

        log.info("[PayrollDeduction] 工资扣款: settlementId={}, type={}, amount={}, previousDeduction={}",
                settlementId, deductionType, deductionAmount, currentDeduction);
        logAppendHelper.appendDeduction(settlement, deductionType, deductionAmount, UserContext.username());
    }
}
