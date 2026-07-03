package com.fashion.supplychain.crm.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.service.ReceivableService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Component
public class ReceivableLogAppendHelper {

    @Autowired
    private ReceivableService receivableService;

    private void appendOperation(String receivableId, String action, String detail) {
        if (receivableId == null || receivableId.trim().isEmpty()) {
            return;
        }
        OperationLogAppendUtil.appendOperation(
            receivableId.trim(),
            receivableService,
            Receivable::getDescription,
            Receivable::setDescription,
            action,
            detail,
            "应收账款"
        );
    }

    public void appendCreate(Receivable receivable, String operatorName) {
        if (receivable == null) return;
        appendOperation(receivable.getId(), "创建应收单",
            "金额：" + (receivable.getAmount() != null ? receivable.getAmount().toString() : "0"));
    }

    public void appendMarkReceived(Receivable receivable, BigDecimal amount, String operatorName) {
        if (receivable == null) return;
        appendOperation(receivable.getId(), "登记到账",
            "金额：" + (amount != null ? amount.toString() : "0")
                + "，状态：" + receivable.getStatus());
    }

    public void appendMarkOverdue(Receivable receivable, String operatorName) {
        if (receivable == null) return;
        appendOperation(receivable.getId(), "标记逾期", null);
    }

    public void appendDelete(Receivable receivable, String operatorName) {
        if (receivable == null) return;
        appendOperation(receivable.getId(), "删除应收单", null);
    }

    public void appendMergeUpdate(Receivable receivable, String detail, String operatorName) {
        if (receivable == null) return;
        appendOperation(receivable.getId(), "合并更新", detail);
    }
}
