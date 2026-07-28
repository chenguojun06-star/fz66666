package com.fashion.supplychain.warehouse.helper;

import com.fashion.supplychain.common.AbstractOperationLogAppendHelper;
import com.fashion.supplychain.warehouse.entity.WarehouseLocation;
import com.fashion.supplychain.warehouse.service.WarehouseLocationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.function.BiConsumer;
import java.util.function.Function;

@Slf4j
@Component
public class WarehouseLocationLogAppendHelper extends AbstractOperationLogAppendHelper<WarehouseLocation, String> {

    @Autowired
    private WarehouseLocationService warehouseLocationService;

    @Override
    protected WarehouseLocationService getService() {
        return warehouseLocationService;
    }

    @Override
    protected String getEntityName() {
        return "仓库库位";
    }

    @Override
    protected Function<WarehouseLocation, String> getRemarkGetter() {
        return WarehouseLocation::getDescription;
    }

    @Override
    protected BiConsumer<WarehouseLocation, String> getRemarkSetter() {
        return WarehouseLocation::setDescription;
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