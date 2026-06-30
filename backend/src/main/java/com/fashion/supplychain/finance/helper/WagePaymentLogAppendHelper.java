package com.fashion.supplychain.finance.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.finance.entity.WagePayment;
import com.fashion.supplychain.finance.service.WagePaymentService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 工资支付操作日志追加
 * P0铁律#6: 操作日志必须记录关键业务操作
 */
@Component
public class WagePaymentLogAppendHelper {

    @Autowired
    private WagePaymentService wagePaymentService;

    private void appendOperation(String paymentId, String action, String detail) {
        if (paymentId == null || paymentId.trim().isEmpty()) {
            return;
        }
        OperationLogAppendUtil.appendOperation(
            paymentId.trim(),
            wagePaymentService,
            WagePayment::getPaymentRemark,
            WagePayment::setPaymentRemark,
            action,
            detail,
            "工资支付"
        );
    }

    public void appendSaveAccount(String ownerId, String ownerType, String accountType) {
        appendOperation(ownerId, "新增收款账户", "账户类型：" + accountType + "，所有者：" + ownerType);
    }

    public void appendRemoveAccount(String ownerId, String ownerType, String accountId) {
        appendOperation(accountId, "停用收款账户", "所有者：" + ownerType);
    }

    public void appendInitiatePayment(String paymentId, String amount, String method) {
        String detail = "金额：" + amount + "，方式：" + method;
        appendOperation(paymentId, "发起工资支付", detail);
    }

    public void appendConfirmOfflinePayment(String paymentId, String paymentNo) {
        appendOperation(paymentId, "确认线下支付", "支付单号：" + paymentNo);
    }

    public void appendConfirmReceived(String paymentId, String paymentNo) {
        appendOperation(paymentId, "确认收款", "支付单号：" + paymentNo);
    }

    public void appendCancelPayment(String paymentId, String paymentNo, String reason) {
        String detail = "支付单号：" + paymentNo + "，原因：" + reason;
        appendOperation(paymentId, "取消支付", detail);
    }

    public void appendRefundPayment(String paymentId, String paymentNo, String reason) {
        String detail = "支付单号：" + paymentNo + "，原因：" + reason;
        appendOperation(paymentId, "退回付款", detail);
    }

    public void appendCreatePendingPayable(String payeeId, String amount) {
        appendOperation(payeeId, "创建待付工资单", "金额：" + amount);
    }

    public void appendRejectPayable(String payeeId, String reason) {
        appendOperation(payeeId, "拒绝付款", "原因：" + reason);
    }
}
