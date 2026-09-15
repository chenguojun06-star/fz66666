package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.common.AbstractOperationLogAppendHelper;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.function.BiConsumer;
import java.util.function.Function;

@Component
public class MaterialDatabaseLogAppendHelper extends AbstractOperationLogAppendHelper<MaterialDatabase, String> {

    @Autowired
    private MaterialDatabaseService materialDatabaseService;

    @Override
    protected IService<MaterialDatabase> getService() {
        return materialDatabaseService;
    }

    @Override
    protected String getEntityName() {
        return "物料数据库";
    }

    @Override
    protected Function<MaterialDatabase, String> getRemarkGetter() {
        return MaterialDatabase::getRemark;
    }

    @Override
    protected BiConsumer<MaterialDatabase, String> getRemarkSetter() {
        return MaterialDatabase::setRemark;
    }

    @Override
    public void appendOperation(String materialId, String action, String detail) {
        super.appendOperation(materialId, action, detail);
    }

    public void appendCreate(String materialId) {
        appendOperation(materialId, "新增物料", null);
    }

    public void appendUpdate(String materialId, String fieldNames) {
        appendOperation(materialId, "修改物料", "更新字段：" + fieldNames);
    }

    public void appendStockIn(String materialId, Integer quantity) {
        appendOperation(materialId, "入库", "入库数量：" + quantity);
    }

    public void appendStockOut(String materialId, Integer quantity) {
        appendOperation(materialId, "出库", "出库数量：" + quantity);
    }

    public void appendPriceChange(String materialId, String oldPrice, String newPrice) {
        appendOperation(materialId, "价格调整", "原价：" + oldPrice + "，新价：" + newPrice);
    }

    public void appendDisable(String materialId, String reason) {
        appendOperation(materialId, "禁用物料", "原因：" + reason);
    }

    public void appendEnable(String materialId) {
        appendOperation(materialId, "启用物料", null);
    }

    public void appendComplete(String materialId) {
        appendOperation(materialId, "完善资料", null);
    }

    public void appendReturnToPending(String materialId, String reason) {
        appendOperation(materialId, "退回待完善", "原因：" + reason);
    }

    public void appendDelete(String materialId) {
        appendOperation(materialId, "删除物料", null);
    }

    /**
     * 带删除原因的日志写入（前端必填原因场景）。
     * 原因拼到 details 字段，可通过 RecordLogDrawer 的 details 列直接看到。
     */
    public void appendDelete(String materialId, String reason) {
        appendOperation(materialId, "删除物料",
                StringUtils.hasText(reason) ? "原因：" + reason.trim() : null);
    }
}