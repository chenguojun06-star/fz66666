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

    /**
     * 收款账户保存审计（D-878 接线）。
     *
     * @param accountId 账户主键——审计 targetId 必须指向被操作的账户实体，
     *                  不能传 ownerId（那是收款人，日志会挂错对象）
     * @param isUpdate  true=修改已有账户，false=新增账户
     */
    public void appendSaveAccount(String accountId, String ownerType, String accountType, boolean isUpdate) {
        appendOperation(accountId, isUpdate ? "修改收款账户" : "新增收款账户",
                "账户类型：" + accountType + "，所有者：" + ownerType);
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

    /**
     * 创建待付工资单审计（D-878 接线）。
     *
     * @param paymentId 支付记录主键（不是 payeeId——日志要挂到被创建的单据上）
     */
    public void appendCreatePendingPayable(String paymentId, String amount) {
        appendOperation(paymentId, "创建待付工资单", "金额：" + amount);
    }

    /**
     * 驳回待付款审计（D-878 接线）。
     *
     * @param paymentId 支付记录主键（不是 payeeId——日志要挂到被驳回的单据上）
     */
    public void appendRejectPayable(String paymentId, String reason) {
        appendOperation(paymentId, "拒绝付款", "原因：" + reason);
    }
}