package com.fashion.supplychain.warehouse.helper;

import com.fashion.supplychain.warehouse.entity.InventoryCheckItem;
import com.fashion.supplychain.warehouse.service.InventoryCheckItemService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@Slf4j
@Component
public class InventoryCheckLogAppendHelper {

    @Autowired
    private InventoryCheckItemService inventoryCheckItemService;

    public void appendOperation(String itemId, String action, String detail) {
        if (itemId == null) return;
        InventoryCheckItem item = inventoryCheckItemService.getById(itemId);
        if (item == null) return;
        String remark = item.getRemark();
        String newRemark = buildRemark(remark, action, detail);
        item.setRemark(newRemark);
        inventoryCheckItemService.updateById(item);
    }

    private String buildRemark(String existing, String action, String detail) {
        StringBuilder sb = new StringBuilder();
        if (existing != null && !existing.isEmpty()) {
            sb.append(existing).append("\n");
        }
        sb.append(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")))
          .append(" [").append(action).append("]");
        if (detail != null) {
            sb.append("：").append(detail);
        }
        return sb.toString();
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
