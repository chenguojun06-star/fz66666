package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.common.AbstractOperationLogAppendHelper;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.service.ProductOutstockService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.function.BiConsumer;
import java.util.function.Function;

@Component
public class ProductOutstockLogAppendHelper extends AbstractOperationLogAppendHelper<ProductOutstock, String> {

    @Autowired
    private ProductOutstockService productOutstockService;

    @Override
    protected IService<ProductOutstock> getService() {
        return productOutstockService;
    }

    @Override
    protected String getEntityName() {
        return "成品出库";
    }

    @Override
    protected Function<ProductOutstock, String> getRemarkGetter() {
        return ProductOutstock::getRemark;
    }

    @Override
    protected BiConsumer<ProductOutstock, String> getRemarkSetter() {
        return ProductOutstock::setRemark;
    }

    @Override
    public void appendOperation(String outstockId, String action, String detail) {
        super.appendOperation(outstockId, action, detail);
    }

    public void appendCreate(String outstockId) {
        appendOperation(outstockId, "创建出库单", null);
    }

    public void appendUpdate(String outstockId, String fieldNames) {
        appendOperation(outstockId, "修改出库单", "更新字段：" + fieldNames);
    }

    public void appendOutstock(String outstockId, Integer quantity) {
        appendOperation(outstockId, "确认出库", "出库数量：" + quantity);
    }

    public void appendCancel(String outstockId, String reason) {
        appendOperation(outstockId, "取消出库", "原因：" + reason);
    }
}