package com.fashion.supplychain.finance.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.service.PayrollSettlementService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class PayrollSettlementLogAppendHelper {

    @Autowired
    private PayrollSettlementService payrollSettlementService;

    public void appendOperation(Long settlementId, String action, String detail) {
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

    public void appendCreate(Long settlementId) {
        appendOperation(settlementId, "创建工资结算", null);
    }

    public void appendSubmit(Long settlementId) {
        appendOperation(settlementId, "提交审核", null);
    }

    public void appendApprove(Long settlementId, String reviewer) {
        appendOperation(settlementId, "审核通过", "审核人：" + reviewer);
    }

    public void appendReject(Long settlementId, String reviewer, String reason) {
        appendOperation(settlementId, "审核驳回", "审核人：" + reviewer + "，原因：" + reason);
    }

    public void appendPaid(Long settlementId) {
        appendOperation(settlementId, "已发放", null);
    }

    public void appendCancel(Long settlementId, String reason) {
        appendOperation(settlementId, "取消结算", "原因：" + reason);
    }
}
