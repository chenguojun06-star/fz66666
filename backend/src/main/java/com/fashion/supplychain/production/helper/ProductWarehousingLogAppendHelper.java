package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 成品入库操作日志追加（追加到生产订单的remarks字段）
 * P0铁律#6: 操作日志必须记录关键业务操作
 */
@Component
public class ProductWarehousingLogAppendHelper {

    @Autowired
    private ProductionOrderService productionOrderService;

    private void appendOperation(String orderId, String action, String detail) {
        if (orderId == null || orderId.trim().isEmpty()) {
            return;
        }
        OperationLogAppendUtil.appendOperation(
            orderId.trim(),
            productionOrderService,
            ProductionOrder::getRemarks,
            ProductionOrder::setRemarks,
            action,
            detail,
            "生产订单"
        );
    }

    public void appendSingleWarehousing(String orderId, int qualifiedQty, int unqualifiedQty) {
        String detail = "合格" + qualifiedQty + "件";
        if (unqualifiedQty > 0) {
            detail += "，次品" + unqualifiedQty + "件";
        }
        appendOperation(orderId, "成品入库", detail);
    }

    public void appendBatchWarehousing(String orderId, int itemCount) {
        appendOperation(orderId, "批量成品入库", "共" + itemCount + "个裁捆");
    }

    public void appendUpdate(String orderId, String detail) {
        appendOperation(orderId, "修改入库记录", detail);
    }

    public void appendDelete(String orderId, String warehousingId) {
        appendOperation(orderId, "删除入库记录", "入库ID:" + warehousingId);
    }

    public void appendRollback(String orderId, String bundleNo) {
        appendOperation(orderId, "撤回入库", "菲号:" + bundleNo);
    }

    public void appendStartRepair(String orderId, String bundleNo) {
        appendOperation(orderId, "开始返修", "菲号:" + bundleNo);
    }

    public void appendCompleteRepair(String orderId, String bundleNo) {
        appendOperation(orderId, "完成返修", "菲号:" + bundleNo);
    }

    public void appendScrap(String orderId, String bundleNo) {
        appendOperation(orderId, "报废裁捆", "菲号:" + bundleNo);
    }
}
