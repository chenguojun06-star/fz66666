package com.fashion.supplychain.warehouse.helper;

import com.fashion.supplychain.common.AbstractOperationLogAppendHelper;
import com.fashion.supplychain.warehouse.entity.InventoryCheckItem;
import com.fashion.supplychain.warehouse.service.InventoryCheckItemService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.function.BiConsumer;
import java.util.function.Function;

@Slf4j
@Component
public class InventoryCheckLogAppendHelper extends AbstractOperationLogAppendHelper<InventoryCheckItem, String> {

    @Autowired
    private InventoryCheckItemService inventoryCheckItemService;

    @Override
    protected InventoryCheckItemService getService() {
        return inventoryCheckItemService;
    }

    @Override
    protected String getEntityName() {
        return "盘点明细";
    }

    @Override
    protected Function<InventoryCheckItem, String> getRemarkGetter() {
        return InventoryCheckItem::getRemark;
    }

    @Override
    protected BiConsumer<InventoryCheckItem, String> getRemarkSetter() {
        return InventoryCheckItem::setRemark;
    }

    @Override
    public void appendOperation(String itemId, String action, String detail) {
        if (itemId == null) return;
        // 操作日志统一写入 t_operation_log，不污染备注（P0：备注仅保留人工备注）
        com.fashion.supplychain.common.OperationLogAppendUtil.writeLog(
                "盘点明细", action, detail, itemId, null);
    }

    public void appendCreate(String itemId) {
        appendOperation(itemId, "创建盘点明细", null);
    }

    public void appendStart(String itemId) {
        appendOperation(itemId, "开始盘点", null);
    }

    public void appendComplete(String itemId) {
        appendOperation(itemId, "完成盘点", null);
    }

    public void appendAdjust(String itemId, Integer variance, String reason) {
        appendOperation(itemId, "调整库存", "差异：" + variance + "，原因：" + reason);
    }

    public void appendCancel(String itemId, String reason) {
        appendOperation(itemId, "取消盘点", "原因：" + reason);
    }
}