package com.fashion.supplychain.finance.orchestration;

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
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

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

    public void callbackPaidUpstream(String bizType, String bizId) {
        Long tenantId = UserContext.tenantId();
        String normalizedBizType = "material_reconciliation".equals(bizType) ? "RECONCILIATION" : bizType;
        try {
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
                    markOrderSettlementPaid(bizId);
                    break;
                case "SHIPMENT_RECONCILIATION":
                    markShipmentReconciliationPaid(bizId, tenantId);
                    break;
                default:
                    log.warn("[付款中心] 未知业务类型: bizType={}", bizType);
            }
            syncBillAggregationOnPaid(normalizedBizType, bizId);
        } catch (Exception e) {
            log.error("[付款中心] 回写上游状态失败: bizType={}, bizId={}", bizType, bizId, e);
        }
    }

    public void callbackRefundUpstream(com.fashion.supplychain.finance.entity.WagePayment payment) {
        if (payment == null || payment.getBizType() == null || payment.getBizId() == null) {
            return;
        }
        String normalizedBizType = "material_reconciliation".equals(payment.getBizType()) ? "RECONCILIATION" : payment.getBizType();
        try {
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
                    markOrderSettlementRefunded(payment.getBizId());
                    break;
                default:
                    log.warn("[工资支付] 退回: 未知业务类型 {}", payment.getBizType());
            }
            syncBillAggregationOnRefund(normalizedBizType, payment.getBizId());
        } catch (Exception e) {
            log.error("[工资支付] 退回回写上游失败: bizType={}, bizId={}", payment.getBizType(), payment.getBizId(), e);
        }
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
            PayrollSettlement psPatch = new PayrollSettlement();
            psPatch.setId(ps.getId());
            psPatch.setStatus("paid");
            psPatch.setUpdateTime(LocalDateTime.now());
            payrollSettlementService.updateById(psPatch);
            log.info("[付款中心] 回写工资结算为paid: id={}", bizId);
        }
    }

    private void markOrderSettlementPaid(String bizId) {
        FinishedSettlementApprovalStatus approval = finishedSettlementApprovalStatusService.lambdaQuery()
                .eq(FinishedSettlementApprovalStatus::getSettlementId, bizId)
                .eq(FinishedSettlementApprovalStatus::getStatus, "approved")
                .last("LIMIT 1")
                .one();
        if (approval != null) {
            FinishedSettlementApprovalStatus approvalPatch = new FinishedSettlementApprovalStatus();
            approvalPatch.setSettlementId(approval.getSettlementId());
            approvalPatch.setStatus("paid");
            approvalPatch.setUpdateTime(LocalDateTime.now());
            finishedSettlementApprovalStatusService.updateById(approvalPatch);
            log.info("[付款中心] 回写成品结算审批为paid: settlementId={}", bizId);
        }
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
        }
    }

    private void markOrderSettlementRefunded(String bizId) {
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

    private void markReconciliationRejected(String bizId, String reason) {
        MaterialReconciliation recon = materialReconciliationService.getById(bizId);
        if (recon != null && "approved".equals(recon.getStatus())) {
            com.fashion.supplychain.common.tenant.TenantAssert.assertBelongsToCurrentTenant(recon.getTenantId(), "物料对账单");
            recon.setStatus("rejected");
            recon.setRemark("【付款驳回】" + (reason != null ? reason : ""));
            recon.setUpdateBy(UserContext.username());
            recon.setUpdateTime(LocalDateTime.now());
            materialReconciliationService.updateById(recon);
            log.info("[付款中心] 驳回物料对账: id={}", bizId);
        }
    }

    private void markReimbursementRejected(String bizId, String reason) {
        ExpenseReimbursement reimb = expenseReimbursementService.getById(bizId);
        if (reimb != null && "approved".equals(reimb.getStatus())) {
            com.fashion.supplychain.common.tenant.TenantAssert.assertBelongsToCurrentTenant(reimb.getTenantId(), "费用报销单");
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
            BillAggregation bill = billAggregationService.lambdaQuery()
                    .eq(BillAggregation::getSourceType, bizType)
                    .eq(BillAggregation::getSourceId, bizId)
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
                bill.setSettledAmount(billAmt);
                bill.setSettledAt(LocalDateTime.now());
                bill.setSettledById(UserContext.userId());
                bill.setSettledByName(UserContext.username());
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
            BillAggregation bill = billAggregationService.lambdaQuery()
                    .eq(BillAggregation::getSourceType, bizType)
                    .eq(BillAggregation::getSourceId, bizId)
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
