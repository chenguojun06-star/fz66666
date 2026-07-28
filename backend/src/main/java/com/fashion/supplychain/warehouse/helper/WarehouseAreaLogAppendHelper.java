package com.fashion.supplychain.warehouse.helper;

import com.fashion.supplychain.common.AbstractOperationLogAppendHelper;
import com.fashion.supplychain.warehouse.entity.WarehouseArea;
import com.fashion.supplychain.warehouse.service.WarehouseAreaService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.function.BiConsumer;
import java.util.function.Function;

@Slf4j
@Component
public class WarehouseAreaLogAppendHelper extends AbstractOperationLogAppendHelper<WarehouseArea, String> {

    @Autowired
    private WarehouseAreaService warehouseAreaService;

    @Override
    protected WarehouseAreaService getService() {
        return warehouseAreaService;
    }

    @Override
    protected String getEntityName() {
        return "仓库区域";
    }

    @Override
    protected Function<WarehouseArea, String> getRemarkGetter() {
        return WarehouseArea::getDescription;
    }

    @Override
    protected BiConsumer<WarehouseArea, String> getRemarkSetter() {
        return WarehouseArea::setDescription;
    }

    public void appendCreate(String areaId) {
        appendOperation(areaId, "新增仓库区域", null);
    }

    public void appendUpdate(String areaId, String fieldNames) {
        appendOperation(areaId, "修改仓库区域", "更新字段：" + fieldNames);
    }

    public void appendDisable(String areaId, String reason) {
        appendOperation(areaId, "禁用区域", "原因：" + reason);
    }

    public void appendEnable(String areaId) {
        appendOperation(areaId, "启用区域", null);
    }
}