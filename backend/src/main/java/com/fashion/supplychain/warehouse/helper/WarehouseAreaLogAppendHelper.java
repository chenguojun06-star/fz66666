package com.fashion.supplychain.warehouse.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.warehouse.entity.WarehouseArea;
import com.fashion.supplychain.warehouse.service.WarehouseAreaService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class WarehouseAreaLogAppendHelper {

    @Autowired
    private WarehouseAreaService warehouseAreaService;

    public void appendOperation(Long areaId, String action, String detail) {
        OperationLogAppendUtil.appendOperation(
            areaId,
            warehouseAreaService,
            WarehouseArea::getDescription,
            WarehouseArea::setDescription,
            action,
            detail,
            "仓库区域"
        );
    }

    public void appendCreate(Long areaId) {
        appendOperation(areaId, "新增仓库区域", null);
    }

    public void appendUpdate(Long areaId, String fieldNames) {
        appendOperation(areaId, "修改仓库区域", "更新字段：" + fieldNames);
    }

    public void appendDisable(Long areaId, String reason) {
        appendOperation(areaId, "禁用区域", "原因：" + reason);
    }

    public void appendEnable(Long areaId) {
        appendOperation(areaId, "启用区域", null);
    }
}
