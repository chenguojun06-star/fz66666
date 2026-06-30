package com.fashion.supplychain.finance.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.finance.entity.Payable;
import com.fashion.supplychain.finance.service.PayableService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 应付账款操作日志追加（追加到description字段）
 * P0铁律#6: 操作日志必须记录关键业务操作
 */
@Component
public class PayableLogAppendHelper {

    @Autowired
    private PayableService payableService;

    private void appendOperation(String payableId, String action, String detail) {
        if (payableId == null || payableId.trim().isEmpty()) {
            return;
        }
        OperationLogAppendUtil.appendOperation(
            payableId.trim(),
            payableService,
            Payable::getDescription,
            Payable::setDescription,
            action,
            detail,
            "应付账款"
        );
    }

    public void appendCreate(String payableId, String amount) {
        appendOperation(payableId, "创建应付单", "金额：" + amount);
    }

    public void appendGenerateFromOrder(String payableId, String orderNo) {
        appendOperation(payableId, "从订单生成应付单", "订单号：" + orderNo);
    }

    public void appendCreateFromBill(String payableId, String billNo) {
        appendOperation(payableId, "从账单创建应付单", "账单号：" + billNo);
    }

    public void appendMarkPaid(String payableId, String amount, String status) {
        appendOperation(payableId, "登记付款", "金额：" + amount + "，状态：" + status);
    }

    public void appendMergeUpdate(String payableId, String addAmount, String totalAmount, String billCount) {
        appendOperation(payableId, "合并账单", "新增金额：" + addAmount + "，总金额：" + totalAmount + "，账单数：" + billCount);
    }

    public void appendDelete(String payableId) {
        appendOperation(payableId, "删除应付单", null);
    }
}
