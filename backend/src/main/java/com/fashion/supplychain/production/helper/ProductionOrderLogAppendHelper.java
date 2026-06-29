package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class ProductionOrderLogAppendHelper {

    @Autowired
    private ProductionOrderService productionOrderService;

    public void appendOperation(String orderId, String action, String detail) {
        OperationLogAppendUtil.appendOperation(
            orderId,
            productionOrderService,
            ProductionOrder::getRemarks,
            ProductionOrder::setRemarks,
            action,
            detail,
            "生产订单"
        );
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
}
