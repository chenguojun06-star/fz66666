package com.fashion.supplychain.finance.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.finance.entity.ExpenseReimbursement;
import com.fashion.supplychain.finance.service.ExpenseReimbursementService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 费用报销操作日志追加（追加到description字段）
 * P0铁律#6: 操作日志必须记录关键业务操作
 */
@Component
public class ExpenseReimbursementLogAppendHelper {

    @Autowired
    private ExpenseReimbursementService expenseReimbursementService;

    private void appendOperation(String reimbursementId, String action, String detail) {
        if (reimbursementId == null || reimbursementId.trim().isEmpty()) {
            return;
        }
        OperationLogAppendUtil.appendOperation(
            reimbursementId.trim(),
            expenseReimbursementService,
            ExpenseReimbursement::getDescription,
            ExpenseReimbursement::setDescription,
            action,
            detail,
            "费用报销"
        );
    }

    public void appendCreate(String reimbursementId, String title, String amount) {
        appendOperation(reimbursementId, "创建报销单", "标题：" + title + "，金额：" + amount);
    }

    public void appendSubmit(String reimbursementId) {
        appendOperation(reimbursementId, "提交报销", null);
    }

    public void appendApprove(String reimbursementId, String reviewer, String amount) {
        appendOperation(reimbursementId, "审批通过", "审批人：" + reviewer + "，金额：" + amount);
    }

    public void appendReject(String reimbursementId, String reviewer, String reason) {
        appendOperation(reimbursementId, "审批驳回", "审批人：" + reviewer + "，原因：" + reason);
    }

    public void appendPay(String reimbursementId, String amount) {
        appendOperation(reimbursementId, "确认付款", "金额：" + amount);
    }

    public void appendDelete(String reimbursementId) {
        appendOperation(reimbursementId, "删除报销单", null);
    }
}
