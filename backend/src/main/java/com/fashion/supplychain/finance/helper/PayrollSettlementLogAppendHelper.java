package com.fashion.supplychain.finance.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.service.PayrollSettlementService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Slf4j
@Component
public class PayrollSettlementLogAppendHelper {

    @Autowired
    private PayrollSettlementService payrollSettlementService;

    private void appendOperation(String settlementId, String action, String detail) {
        if (settlementId == null) return;
        OperationLogAppendUtil.appendOperation(
            settlementId,
            payrollSettlementService,
            PayrollSettlement::getRemark,
            PayrollSettlement::setRemark,
            action,
            detail,
            "工资结算"
        );
    }

    public void appendCreate(PayrollSettlement settlement, String operatorName) {
        if (settlement == null) return;
        appendOperation(settlement.getId(), "创建工资结算",
            "金额：" + (settlement.getTotalAmount() != null ? settlement.getTotalAmount().toString() : "0"));
    }

    public void appendApprove(PayrollSettlement settlement, String operatorName) {
        if (settlement == null) return;
        appendOperation(settlement.getId(), "审核通过",
            "审核人：" + (operatorName != null ? operatorName : ""));
    }

    public void appendReject(PayrollSettlement settlement, String reason, String operatorName) {
        if (settlement == null) return;
        appendOperation(settlement.getId(), "审核驳回",
            "审核人：" + (operatorName != null ? operatorName : "")
                + "，原因：" + (reason != null ? reason : ""));
    }

    public void appendCancel(PayrollSettlement settlement, String operatorName) {
        if (settlement == null) return;
        appendOperation(settlement.getId(), "取消结算", null);
    }

    public void appendPayment(PayrollSettlement settlement, BigDecimal amount, String operatorName) {
        if (settlement == null) return;
        appendOperation(settlement.getId(), "发放工资",
            "金额：" + (amount != null ? amount.toString() : "0"));
    }

    public void appendDeduction(PayrollSettlement settlement, String type, BigDecimal amount, String operatorName) {
        if (settlement == null) return;
        appendOperation(settlement.getId(), "工资扣款",
            "类型：" + (type != null ? type : "")
                + "，金额：" + (amount != null ? amount.toString() : "0"));
    }

    public void appendCreate(String settlementId) {
        appendOperation(settlementId, "创建工资结算", null);
    }

    public void appendSubmit(String settlementId) {
        appendOperation(settlementId, "提交审核", null);
    }

    public void appendApprove(String settlementId, String reviewer) {
        appendOperation(settlementId, "审核通过", "审核人：" + reviewer);
    }

    public void appendReject(String settlementId, String reviewer, String reason) {
        appendOperation(settlementId, "审核驳回", "审核人：" + reviewer + "，原因：" + reason);
    }

    public void appendPaid(String settlementId) {
        appendOperation(settlementId, "已发放", null);
    }

    public void appendCancel(String settlementId, String reason) {
        appendOperation(settlementId, "取消结算", "原因：" + reason);
    }
}
