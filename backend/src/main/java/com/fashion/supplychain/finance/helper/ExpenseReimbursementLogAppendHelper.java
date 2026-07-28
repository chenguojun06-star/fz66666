package com.fashion.supplychain.finance.helper;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.common.AbstractOperationLogAppendHelper;
import com.fashion.supplychain.finance.entity.ExpenseReimbursement;
import com.fashion.supplychain.finance.service.ExpenseReimbursementService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.function.BiConsumer;
import java.util.function.Function;

@Component
public class ExpenseReimbursementLogAppendHelper extends AbstractOperationLogAppendHelper<ExpenseReimbursement, String> {

    @Autowired
    private ExpenseReimbursementService expenseReimbursementService;

    @Override
    protected IService<ExpenseReimbursement> getService() {
        return expenseReimbursementService;
    }

    @Override
    protected String getEntityName() {
        return "费用报销";
    }

    @Override
    protected Function<ExpenseReimbursement, String> getRemarkGetter() {
        return ExpenseReimbursement::getDescription;
    }

    @Override
    protected BiConsumer<ExpenseReimbursement, String> getRemarkSetter() {
        return ExpenseReimbursement::setDescription;
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