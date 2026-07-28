package com.fashion.supplychain.finance.helper;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.common.AbstractOperationLogAppendHelper;
import com.fashion.supplychain.finance.entity.WagePayment;
import com.fashion.supplychain.finance.service.WagePaymentService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.function.BiConsumer;
import java.util.function.Function;

@Component
public class WagePaymentLogAppendHelper extends AbstractOperationLogAppendHelper<WagePayment, String> {

    @Autowired
    private WagePaymentService wagePaymentService;

    @Override
    protected IService<WagePayment> getService() {
        return wagePaymentService;
    }

    @Override
    protected String getEntityName() {
        return "工资支付";
    }

    @Override
    protected Function<WagePayment, String> getRemarkGetter() {
        return WagePayment::getPaymentRemark;
    }

    @Override
    protected BiConsumer<WagePayment, String> getRemarkSetter() {
        return WagePayment::setPaymentRemark;
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