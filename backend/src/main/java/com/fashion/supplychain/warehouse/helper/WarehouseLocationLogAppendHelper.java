package com.fashion.supplychain.warehouse.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.warehouse.entity.WarehouseLocation;
import com.fashion.supplychain.warehouse.service.WarehouseLocationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class WarehouseLocationLogAppendHelper {

    @Autowired
    private WarehouseLocationService warehouseLocationService;

    public void appendOperation(String locationId, String action, String detail) {
        if (locationId == null) return;
        OperationLogAppendUtil.appendOperation(
            locationId,
            warehouseLocationService,
            WarehouseLocation::getDescription,
            WarehouseLocation::setDescription,
            action,
            detail,
            "仓库库位"
        );
    }

    public void appendCreate(String locationId) {
        appendOperation(locationId, "新增库位", null);
    }

    public void appendUpdate(String locationId, String fieldNames) {
        appendOperation(locationId, "修改库位", "更新字段：" + fieldNames);
    }

    public void appendDisable(String locationId, String reason) {
        appendOperation(locationId, "禁用库位", "原因：" + reason);
    }

    public void appendEnable(String locationId) {
        appendOperation(locationId, "启用库位", null);
    }

    public void appendAssign(String locationId, String purpose) {
        appendOperation(locationId, "分配用途", "用途：" + purpose);
    }
}
