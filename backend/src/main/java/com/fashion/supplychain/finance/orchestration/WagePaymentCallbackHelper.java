package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.BillAggregation;
import com.fashion.supplychain.finance.entity.ExpenseReimbursement;
import com.fashion.supplychain.finance.entity.FinishedSettlementApprovalStatus;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.BillAggregationService;
import com.fashion.supplychain.finance.service.ExpenseReimbursementService;
import com.fashion.supplychain.finance.service.FinishedSettlementApprovalStatusService;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.PayrollSettlementService;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class WagePaymentCallbackHelper {

    private final MaterialReconciliationService materialReconciliationService;
    private final ExpenseReimbursementService expenseReimbursementService;
    private final PayrollSettlementService payrollSettlementService;
    private final FinishedSettlementApprovalStatusService finishedSettlementApprovalStatusService;
    private final ShipmentReconciliationService shipmentReconciliationService;
    private final BillAggregationService billAggregationService;
    private final ScanRecordMapper scanRecordMapper;
    private final com.fashion.supplychain.production.service.ProductionOrderService productionOrderService;

    public void callbackPaidUpstream(String bizType, String bizId) {
        Long tenantId = UserContext.tenantId();
        String normalizedBizType = "material_reconciliation".equals(bizType) ? "RECONCILIATION" : bizType;
        switch (normalizedBizType) {
            case "RECONCILIATION":
                markReconciliationPaid(bizId, tenantId);
                break;
            case "REIMBURSEMENT":
                markReimbursementPaid(bizId, tenantId);
                break;
            case "PAYROLL":
            case "PAYROLL_SETTLEMENT":
                markPayrollSettlementPaid(bizId, tenantId);
                break;
            case "ORDER_SETTLEMENT":
                markOrderSettlementPaid(bizId, tenantId);
                break;
            case "SHIPMENT_RECONCILIATION":
                markShipmentReconciliationPaid(bizId, tenantId);
                break;
            default:
                log.warn("[付款中心] 未知业务类型: bizType={}", bizType);
        }
        syncBillAggregationOnPaid(normalizedBizType, bizId);
    }

    public void callbackRefundUpstream(com.fashion.supplychain.finance.entity.WagePayment payment) {
        if (payment == null || payment.getBizType() == null || payment.getBizId() == null) {
            return;
        }
        String normalizedBizType = "material_reconciliation".equals(payment.getBizType()) ? "RECONCILIATION" : payment.getBizType();
        switch (normalizedBizType) {
            case "RECONCILIATION":
                markReconciliationRefunded(payment.getBizId(), payment.getTenantId());
                break;
            case "REIMBURSEMENT":
                markReimbursementRefunded(payment.getBizId(), payment.getTenantId());
                break;
            case "PAYROLL_SETTLEMENT":
                markPayrollSettlementRefunded(payment.getBizId(), payment.getTenantId());
                break;
            case "ORDER_SETTLEMENT":
                markOrderSettlementRefunded(payment.getBizId(), payment.getTenantId());
                break;
            case "SHIPMENT_RECONCILIATION":
                markShipmentReconciliationRefunded(payment.getBizId(), payment.getTenantId());
                break;
            default:
                log.warn("[工资支付] 退回: 未知业务类型 {}", payment.getBizType());
        }
        syncBillAggregationOnRefund(normalizedBizType, payment.getBizId());
    }

    public void callbackRejectUpstream(String bizType, String bizId, String reason) {
        String normalizedBizType = "material_reconciliation".equals(bizType) ? "RECONCILIATION" : bizType;
        try {
            switch (normalizedBizType) {
                case "RECONCILIATION":
                    markReconciliationRejected(bizId, reason);
                    break;
                case "REIMBURSEMENT":
                    markReimbursementRejected(bizId, reason);
                    break;
                default:
                    log.warn("[付款中心] 驳回: 未知业务类型 {}", bizType);
            }
        } catch (Exception e) {
            log.error("[付款中心] 驳回回写上游失败: bizType={}, bizId={}", bizType, bizId, e);
        }
    }

    public void callbackPayrollSettlementRejected(String bizId, Long tenantId) {
        try {
            PayrollSettlement ps = payrollSettlementService.lambdaQuery()
                    .eq(PayrollSettlement::getId, bizId)
                    .eq(PayrollSettlement::getTenantId, tenantId)
                    .one();
            if (ps != null && "approved".equals(ps.getStatus())) {
                PayrollSettlement psPatch = new PayrollSettlement();
                psPatch.setId(ps.getId());
                psPatch.setStatus("rejected");
                psPatch.setUpdateTime(LocalDateTime.now());
                payrollSettlementService.updateById(psPatch);
                log.info("[付款中心] 驳回回写工资结算: id={}, approved->rejected", bizId);
            }
        } catch (Exception e) {
            log.error("[付款中心] 驳回回写工资结算失败: bizId={}", bizId, e);
        }
    }

    public void callbackOrderSettlementRejected(String bizId) {
        try {
            FinishedSettlementApprovalStatus approval = finishedSettlementApprovalStatusService.lambdaQuery()
                    .eq(FinishedSettlementApprovalStatus::getSettlementId, bizId)
                    .eq(FinishedSettlementApprovalStatus::getStatus, "approved")
                    .last("LIMIT 1")
                    .one();
            if (approval != null) {
                FinishedSettlementApprovalStatus patch = new FinishedSettlementApprovalStatus();
                patch.setSettlementId(approval.getSettlementId());
                patch.setStatus("rejected");
                patch.setUpdateTime(LocalDateTime.now());
                finishedSettlementApprovalStatusService.updateById(patch);
                log.info("[付款中心] 驳回回写成品结算审批: settlementId={}, approved->rejected", bizId);
            }
        } catch (Exception e) {
            log.error("[付款中心] 驳回回写成品结算审批失败: bizId={}", bizId, e);
        }
    }

    private void markReconciliationPaid(String bizId, Long tenantId) {
        MaterialReconciliation recon = materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getId, bizId)
                .eq(MaterialReconciliation::getTenantId, tenantId)
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .one();
        if (recon != null && "approved".equals(recon.getStatus())) {
            recon.setStatus("paid");
            recon.setPaidAt(LocalDateTime.now());
            recon.setUpdateBy(UserContext.username());
            recon.setUpdateTime(LocalDateTime.now());
            materialReconciliationService.updateById(recon);
            log.info("[付款中心] 回写物料对账为paid: id={}, no={}", bizId, recon.getReconciliationNo());
        }
    }

    private void markReimbursementPaid(String bizId, Long tenantId) {
        ExpenseReimbursement reimb = expenseReimbursementService.lambdaQuery()
                .eq(ExpenseReimbursement::getId, bizId)
                .eq(ExpenseReimbursement::getTenantId, tenantId)
                .eq(ExpenseReimbursement::getDeleteFlag, 0)
                .one();
        if (reimb != null && "approved".equals(reimb.getStatus())) {
            reimb.setStatus("paid");
            reimb.setPaymentTime(LocalDateTime.now());
            reimb.setPaymentBy(UserContext.username());
            reimb.setUpdateBy(UserContext.username());
            reimb.setUpdateTime(LocalDateTime.now());
            expenseReimbursementService.updateById(reimb);
            log.info("[付款中心] 回写费用报销为paid: id={}, no={}", bizId, reimb.getReimbursementNo());
        }
    }

    private void markPayrollSettlementPaid(String bizId, Long tenantId) {
        PayrollSettlement ps = payrollSettlementService.lambdaQuery()
                .eq(PayrollSettlement::getId, bizId)
                .eq(PayrollSettlement::getTenantId, tenantId)
                .one();
        if (ps != null && "approved".equals(ps.getStatus())) {
            // 付清口径与 PayrollSettlementMapper.atomicAddPaidAmount 一致：剩余 = 总额-已付-扣款-预支
            java.math.BigDecimal total = ps.getTotalAmount() != null ? ps.getTotalAmount() : java.math.BigDecimal.ZERO;
            java.math.BigDecimal paid = ps.getPaidAmount() != null ? ps.getPaidAmount() : java.math.BigDecimal.ZERO;
            java.math.BigDecimal deduction = ps.getDeductionAmount() != null ? ps.getDeductionAmount() : java.math.BigDecimal.ZERO;
            java.math.BigDecimal advance = ps.getAdvanceAmount() != null ? ps.getAdvanceAmount() : java.math.BigDecimal.ZERO;
            java.math.BigDecimal remaining = total.subtract(paid).subtract(deduction).subtract(advance)
                    .max(java.math.BigDecimal.ZERO);
            PayrollSettlement psPatch = new PayrollSettlement();
            psPatch.setId(ps.getId());
            // 剩余部分视为本次由付款中心付清：同步累计已付并清零剩余，防止 recordPayment 路径二次打款
            psPatch.setPaidAmount(paid.add(remaining));
            psPatch.setRemainingAmount(java.math.BigDecimal.ZERO);
            psPatch.setStatus("paid");
            psPatch.setUpdateTime(LocalDateTime.now());
            payrollSettlementService.updateById(psPatch);
            log.info("[付款中心] 回写工资结算为paid: id={}, 付清剩余={}", bizId, remaining);
        }
    }

    private void markOrderSettlementPaid(String bizId, Long tenantId) {
        // D-136 修复 ID 错位（与 D-131 工资链同款病灶）：ORDER_SETTLEMENT 终审推送时 bizId=工厂ID（或降级工厂名），
        // 旧实现按 settlementId(订单ID)=bizId 查询永远落空 → 付款后订单停在 approved → 下月工厂汇总重复推送重复付款。
        // 口径：付款成功 → 该工厂全部"已审批"订单的结算审批置为 paid（与推送时聚合全部已审批订单一致）。
        // 先兼容旧口径（bizId 恰为某订单ID 的历史数据），再按工厂维度批量回写。
        boolean singleHit = markSingleOrderSettlementPaid(bizId, tenantId);
        int factoryHit = markFactoryOrdersSettlementPaid(bizId, tenantId);
        if (!singleHit && factoryHit == 0) {
            log.warn("[付款中心] 订单结算回写未命中任何订单: bizId={}", bizId);
        }
    }

    private boolean markSingleOrderSettlementPaid(String bizId, Long tenantId) {
        FinishedSettlementApprovalStatus approval = finishedSettlementApprovalStatusService.lambdaQuery()
                .eq(FinishedSettlementApprovalStatus::getSettlementId, bizId)
                .eq(FinishedSettlementApprovalStatus::getStatus, "approved")
                .last("LIMIT 1")
                .one();
        if (approval == null) {
            return false;
        }
        FinishedSettlementApprovalStatus approvalPatch = new FinishedSettlementApprovalStatus();
        approvalPatch.setSettlementId(approval.getSettlementId());
        approvalPatch.setStatus("paid");
        approvalPatch.setUpdateTime(LocalDateTime.now());
        finishedSettlementApprovalStatusService.updateById(approvalPatch);
        log.info("[付款中心] 回写成品结算审批为paid: settlementId={}", bizId);
        return true;
    }

    private int markFactoryOrdersSettlementPaid(String bizId, Long tenantId) {
        if (!org.springframework.util.StringUtils.hasText(bizId)) {
            return 0;
        }
        List<com.fashion.supplychain.production.entity.ProductionOrder> factoryOrders =
                productionOrderService.lambdaQuery()
                        .eq(com.fashion.supplychain.production.entity.ProductionOrder::getTenantId, tenantId)
                        .and(w -> w.eq(com.fashion.supplychain.production.entity.ProductionOrder::getFactoryId, bizId)
                                .or().eq(com.fashion.supplychain.production.entity.ProductionOrder::getFactoryName, bizId))
                        .list();
        if (factoryOrders == null || factoryOrders.isEmpty()) {
            return 0;
        }
        java.util.Set<String> orderIds = factoryOrders.stream()
                .map(com.fashion.supplychain.production.entity.ProductionOrder::getId)
                .filter(id -> id != null && !id.isEmpty())
                .collect(java.util.stream.Collectors.toSet());
        if (orderIds.isEmpty()) {
            return 0;
        }
        List<FinishedSettlementApprovalStatus> approvals = finishedSettlementApprovalStatusService.lambdaQuery()
                .eq(FinishedSettlementApprovalStatus::getTenantId, tenantId)
                .eq(FinishedSettlementApprovalStatus::getStatus, "approved")
                .in(FinishedSettlementApprovalStatus::getSettlementId, orderIds)
                .list();
        if (approvals == null || approvals.isEmpty()) {
            return 0;
        }
        for (FinishedSettlementApprovalStatus approval : approvals) {
            FinishedSettlementApprovalStatus patch = new FinishedSettlementApprovalStatus();
            patch.setSettlementId(approval.getSettlementId());
            patch.setStatus("paid");
            patch.setUpdateTime(LocalDateTime.now());
            finishedSettlementApprovalStatusService.updateById(patch);
        }
        log.info("[付款中心] 按工厂回写成品结算审批为paid: bizId={}, 命中{}单", bizId, approvals.size());
        return approvals.size();
    }

    private void markShipmentReconciliationPaid(String bizId, Long tenantId) {
        ShipmentReconciliation sr = shipmentReconciliationService.lambdaQuery()
                .eq(ShipmentReconciliation::getId, bizId)
                .eq(ShipmentReconciliation::getTenantId, tenantId)
                .one();
        if (sr != null && "approved".equals(sr.getStatus())) {
            ShipmentReconciliation srPatch = new ShipmentReconciliation();
            srPatch.setId(sr.getId());
            srPatch.setStatus("paid");
            srPatch.setUpdateTime(LocalDateTime.now());
            shipmentReconciliationService.updateById(srPatch);
            log.info("[付款中心] 回写出货对账为paid: id={}", bizId);
        }
    }

    private void markReconciliationRefunded(String bizId, Long tenantId) {
        MaterialReconciliation recon = materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getId, bizId)
                .eq(MaterialReconciliation::getTenantId, tenantId)
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .one();
        if (recon != null && "paid".equals(recon.getStatus())) {
            recon.setStatus("approved");
            recon.setPaidAt(null);
            recon.setRemark((recon.getRemark() != null ? recon.getRemark() + "\n" : "")
                    + "【付款退回】" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            recon.setUpdateBy(UserContext.username());
            recon.setUpdateTime(LocalDateTime.now());
            materialReconciliationService.updateById(recon);
            log.info("[工资支付] 退回回写物料对账: id={}, status=paid->approved", bizId);
        }
    }

    private void markReimbursementRefunded(String bizId, Long tenantId) {
        ExpenseReimbursement reimb = expenseReimbursementService.lambdaQuery()
                .eq(ExpenseReimbursement::getId, bizId)
                .eq(ExpenseReimbursement::getTenantId, tenantId)
                .eq(ExpenseReimbursement::getDeleteFlag, 0)
                .one();
        if (reimb != null && "paid".equals(reimb.getStatus())) {
            reimb.setStatus("approved");
            reimb.setPaymentTime(null);
            reimb.setPaymentBy(null);
            reimb.setApprovalRemark("【付款退回】" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
            reimb.setUpdateBy(UserContext.username());
            reimb.setUpdateTime(LocalDateTime.now());
            expenseReimbursementService.updateById(reimb);
            log.info("[工资支付] 退回回写费用报销: id={}, status=paid->approved", bizId);
        }
    }

    private void markPayrollSettlementRefunded(String bizId, Long tenantId) {
        PayrollSettlement psRefund = payrollSettlementService.lambdaQuery()
                .eq(PayrollSettlement::getId, bizId)
                .eq(PayrollSettlement::getTenantId, tenantId)
                .one();
        if (psRefund != null && "paid".equals(psRefund.getStatus())) {
            PayrollSettlement psPatch = new PayrollSettlement();
            psPatch.setId(psRefund.getId());
            psPatch.setStatus("approved");
            psPatch.setUpdateTime(LocalDateTime.now());
            payrollSettlementService.updateById(psPatch);
            log.info("[工资支付] 退回回写工资结算: id={}, paid->approved", bizId);

            // P1-6 修复：退款后释放 ScanRecord 绑定，让操作员可以重新扫码
            // 原实现只回写 PayrollSettlement 状态，未释放 ScanRecord 的 payrollSettlementId/settlementStatus
            // 导致操作员扫码时被 ScanUndoHelper.assertNotPayrollSettled 拦截，无法重扫
            releaseScanRecordsForRefund(bizId, tenantId);
        }
    }

    /**
     * 退款后释放扫码记录绑定（P1-6 用户级阻塞修复）
     * <p>
     * 原状态：settlementStatus=payroll_approved / payroll_settled，payrollSettlementId=bizId
     * 释放后：settlementStatus=null，payrollSettlementId=null
     * 这样操作员可以重新对这些扫码记录进行撤回/重扫操作
     * <p>
     * 多租户安全：UPDATE 显式带 tenant_id WHERE，符合 P0 铁律4
     */
    private void releaseScanRecordsForRefund(String payrollSettlementId, Long tenantId) {
        try {
            LocalDateTime now = LocalDateTime.now();
            LambdaUpdateWrapper<ScanRecord> uw = new LambdaUpdateWrapper<ScanRecord>()
                    .set(ScanRecord::getSettlementStatus, null)
                    .set(ScanRecord::getPayrollSettlementId, null)
                    .set(ScanRecord::getUpdateTime, now)
                    .eq(ScanRecord::getPayrollSettlementId, payrollSettlementId)
                    .eq(ScanRecord::getTenantId, tenantId);
            int rows = scanRecordMapper.update(null, uw);
            log.info("[工资支付] 退款释放扫码记录绑定: payrollSettlementId={}, tenantId={}, releasedRows={}",
                    payrollSettlementId, tenantId, rows);
        } catch (Exception e) {
            log.error("[工资支付] 退款释放扫码记录失败（不影响退款主流程）: payrollSettlementId={}, err={}",
                    payrollSettlementId, e.getMessage(), e);
        }
    }

    private void markOrderSettlementRefunded(String bizId, Long tenantId) {
        FinishedSettlementApprovalStatus approvalRefund = finishedSettlementApprovalStatusService.lambdaQuery()
                .eq(FinishedSettlementApprovalStatus::getSettlementId, bizId)
                .eq(FinishedSettlementApprovalStatus::getStatus, "paid")
                .last("LIMIT 1")
                .one();
        if (approvalRefund != null) {
            FinishedSettlementApprovalStatus patchRefund = new FinishedSettlementApprovalStatus();
            patchRefund.setSettlementId(approvalRefund.getSettlementId());
            patchRefund.setStatus("approved");
            patchRefund.setUpdateTime(LocalDateTime.now());
            finishedSettlementApprovalStatusService.updateById(patchRefund);
            log.info("[工资支付] 退回回写成品结算审批: settlementId={}, paid->approved", bizId);
        }
    }

    private void markShipmentReconciliationRefunded(String bizId, Long tenantId) {
        ShipmentReconciliation sr = shipmentReconciliationService.lambdaQuery()
                .eq(ShipmentReconciliation::getId, bizId)
                .eq(ShipmentReconciliation::getTenantId, tenantId)
                .one();
        if (sr != null && "paid".equals(sr.getStatus())) {
            ShipmentReconciliation srPatch = new ShipmentReconciliation();
            srPatch.setId(sr.getId());
            srPatch.setStatus("approved");
            srPatch.setUpdateTime(LocalDateTime.now());
            shipmentReconciliationService.updateById(srPatch);
            log.info("[工资支付] 退回回写出货对账: id={}, paid->approved", bizId);
        }
    }

    private void markReconciliationRejected(String bizId, String reason) {
        Long tenantId = UserContext.tenantId();
        MaterialReconciliation recon = materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getId, bizId)
                .eq(MaterialReconciliation::getTenantId, tenantId)
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .one();
        if (recon != null && "approved".equals(recon.getStatus())) {
            recon.setStatus("rejected");
            recon.setRemark("【付款驳回】" + (reason != null ? reason : ""));
            recon.setUpdateBy(UserContext.username());
            recon.setUpdateTime(LocalDateTime.now());
            materialReconciliationService.updateById(recon);
            log.info("[付款中心] 驳回物料对账: id={}", bizId);
        }
    }

    private void markReimbursementRejected(String bizId, String reason) {
        Long tenantId = UserContext.tenantId();
        ExpenseReimbursement reimb = expenseReimbursementService.lambdaQuery()
                .eq(ExpenseReimbursement::getId, bizId)
                .eq(ExpenseReimbursement::getTenantId, tenantId)
                .eq(ExpenseReimbursement::getDeleteFlag, 0)
                .one();
        if (reimb != null && "approved".equals(reimb.getStatus())) {
            reimb.setStatus("rejected");
            reimb.setApprovalRemark("【付款驳回】" + (reason != null ? reason : ""));
            reimb.setUpdateBy(UserContext.username());
            reimb.setUpdateTime(LocalDateTime.now());
            expenseReimbursementService.updateById(reimb);
            log.info("[付款中心] 驳回费用报销: id={}", bizId);
        }
    }

    private void syncBillAggregationOnPaid(String bizType, String bizId) {
        if (billAggregationService == null) {
            return;
        }
        try {
            // P0铁律4：多租户隔离，必须按 tenantId 过滤，防止跨租户账单被误更新
            Long tenantId = UserContext.tenantId();
            BillAggregation bill = billAggregationService.lambdaQuery()
                    .eq(BillAggregation::getSourceType, bizType)
                    .eq(BillAggregation::getSourceId, bizId)
                    .eq(BillAggregation::getTenantId, tenantId)
                    .eq(BillAggregation::getDeleteFlag, 0)
                    .last("LIMIT 1")
                    .one();
            if (bill != null) {
                BigDecimal settled = bill.getSettledAmount() != null ? bill.getSettledAmount() : BigDecimal.ZERO;
                BigDecimal billAmt = bill.getAmount() != null ? bill.getAmount() : BigDecimal.ZERO;
                String newStatus = settled.compareTo(billAmt) >= 0 ? "SETTLED" : "SETTLING";
                if ("PENDING".equals(bill.getStatus()) || "CONFIRMED".equals(bill.getStatus())) {
                    newStatus = settled.compareTo(billAmt) >= 0 ? "SETTLED" : "SETTLING";
                }
                bill.setStatus(newStatus);
                if ("SETTLED".equals(newStatus)) {
                    // 仅结清时置全额：SETTLING（部分付款）保留原 settledAmount，
                    // 避免付 1 元就把 1 万账单的已结金额虚增为全额
                    bill.setSettledAmount(billAmt);
                    bill.setSettledAt(LocalDateTime.now());
                    bill.setSettledById(UserContext.userId());
                    bill.setSettledByName(UserContext.username());
                }
                bill.setUpdateTime(LocalDateTime.now());
                billAggregationService.updateById(bill);
                log.info("[付款中心] 联动账单汇总: billNo={}, ->{}", bill.getBillNo(), newStatus);
            }
        } catch (Exception e) {
            log.error("[付款中心] 联动账单汇总失败: bizType={}, bizId={}", bizType, bizId, e);
        }
    }

    private void syncBillAggregationOnRefund(String bizType, String bizId) {
        if (billAggregationService == null) {
            return;
        }
        try {
            // P0铁律4：多租户隔离，必须按 tenantId 过滤，防止跨租户账单被误更新
            Long tenantId = UserContext.tenantId();
            BillAggregation bill = billAggregationService.lambdaQuery()
                    .eq(BillAggregation::getSourceType, bizType)
                    .eq(BillAggregation::getSourceId, bizId)
                    .eq(BillAggregation::getTenantId, tenantId)
                    .eq(BillAggregation::getDeleteFlag, 0)
                    .last("LIMIT 1")
                    .one();
            if (bill != null && "SETTLED".equals(bill.getStatus())) {
                bill.setStatus("CONFIRMED");
                bill.setSettledAmount(BigDecimal.ZERO);
                bill.setSettledAt(null);
                bill.setSettledById(null);
                bill.setSettledByName(null);
                bill.setRemark((bill.getRemark() != null ? bill.getRemark() + " | " : "")
                        + "付款退回，状态回退至CONFIRMED");
                billAggregationService.updateById(bill);
                log.info("[工资支付] 退回回写账单汇总: billNo={}, SETTLED->CONFIRMED", bill.getBillNo());
            }
        } catch (Exception e) {
            log.error("[工资支付] 退回回写账单汇总失败: bizType={}, bizId={}", bizType, bizId, e);
        }
    }
}
