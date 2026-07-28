package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.common.AbstractOperationLogAppendHelper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.function.BiConsumer;
import java.util.function.Function;

@Component
public class ProductionOrderLogAppendHelper extends AbstractOperationLogAppendHelper<ProductionOrder, String> {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Override
    protected IService<ProductionOrder> getService() {
        return productionOrderService;
    }

    @Override
    protected String getEntityName() {
        return "生产订单";
    }

    @Override
    protected Function<ProductionOrder, String> getRemarkGetter() {
        return ProductionOrder::getRemarks;
    }

    @Override
    protected BiConsumer<ProductionOrder, String> getRemarkSetter() {
        return ProductionOrder::setRemarks;
    }

    @Override
    public void appendOperation(String orderId, String action, String detail) {
        super.appendOperation(orderId, action, detail);
    }

    public void appendCreate(String orderId) {
        appendOperation(orderId, "创建订单", null);
    }

    public void appendCreateFromStyle(String orderId, String styleNo) {
        appendOperation(orderId, "从款式创建", "款号：" + styleNo);
    }

    public void appendUpdate(String orderId, String fieldNames) {
        appendOperation(orderId, "修改订单", "更新字段：" + fieldNames);
    }

    public void appendUpdateProgress(String orderId, Integer progress) {
        appendOperation(orderId, "更新生产进度", "进度：" + progress + "%");
    }

    public void appendComplete(String orderId) {
        appendOperation(orderId, "完成生产", null);
    }

    public void appendUpdateMaterialArrival(String orderId, Integer rate) {
        appendOperation(orderId, "更新物料到货率", "到货率：" + rate + "%");
    }

    public void appendCancel(String orderId, String reason) {
        appendOperation(orderId, "取消订单", "原因：" + reason);
    }

    public void appendUrge(String orderId, String content) {
        appendOperation(orderId, "订单催单", content);
    }

    public void appendClose(String orderId, String remark) {
        appendOperation(orderId, "关闭订单", StringUtils.hasText(remark) ? "备注：" + remark : null);
    }

    public void appendLockWorkflow(String orderId, String operator) {
        appendOperation(orderId, "锁定工序流程", "操作人：" + operator);
    }

    public void appendRollbackWorkflow(String orderId, String reason) {
        appendOperation(orderId, "回滚工序流程", StringUtils.hasText(reason) ? "原因：" + reason : null);
    }

    public void appendDelegateProcess(String orderId, String delegateNote) {
        appendOperation(orderId, "工序委派", delegateNote);
    }

    public void appendConfirmProcurement(String orderId, String remark) {
        appendOperation(orderId, "确认采购完成", StringUtils.hasText(remark) ? "备注：" + remark : null);
    }
}