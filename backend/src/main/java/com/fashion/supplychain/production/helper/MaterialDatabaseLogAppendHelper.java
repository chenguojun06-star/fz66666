package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class MaterialDatabaseLogAppendHelper {

    @Autowired
    private MaterialDatabaseService materialDatabaseService;

    public void appendOperation(String materialId, String action, String detail) {
        if (materialId == null) return;
        OperationLogAppendUtil.appendOperation(
            materialId,
            materialDatabaseService,
            MaterialDatabase::getRemark,
            MaterialDatabase::setRemark,
            action,
            detail,
            "物料数据库"
        );
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
}
