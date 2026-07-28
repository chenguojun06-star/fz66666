package com.fashion.supplychain.finance.helper;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.common.AbstractOperationLogAppendHelper;
import com.fashion.supplychain.finance.entity.Payable;
import com.fashion.supplychain.finance.service.PayableService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.function.BiConsumer;
import java.util.function.Function;

@Component
public class PayableLogAppendHelper extends AbstractOperationLogAppendHelper<Payable, String> {

    @Autowired
    private PayableService payableService;

    @Override
    protected IService<Payable> getService() {
        return payableService;
    }

    @Override
    protected String getEntityName() {
        return "应付账款";
    }

    @Override
    protected Function<Payable, String> getRemarkGetter() {
        return Payable::getDescription;
    }

    @Override
    protected BiConsumer<Payable, String> getRemarkSetter() {
        return Payable::setDescription;
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