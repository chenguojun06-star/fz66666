package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.production.entity.CuttingBom;
import com.fashion.supplychain.production.service.CuttingBomService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class CuttingBomLogAppendHelper {

    @Autowired
    private CuttingBomService cuttingBomService;

    public void appendOperation(Long bomId, String action, String detail) {
        OperationLogAppendUtil.appendOperation(
            bomId,
            cuttingBomService,
            CuttingBom::getRemark,
            CuttingBom::setRemark,
            action,
            detail,
            "裁剪BOM"
        );
    }

    public void appendCreate(Long bomId) {
        appendOperation(bomId, "创建裁剪BOM", null);
    }

    public void appendUpdate(Long bomId, String fieldNames) {
        appendOperation(bomId, "修改裁剪BOM", "更新字段：" + fieldNames);
    }

    public void appendAddMaterial(Long bomId, String materialName) {
        appendOperation(bomId, "添加物料", "物料：" + materialName);
    }

    public void appendRemoveMaterial(Long bomId, String materialName) {
        appendOperation(bomId, "移除物料", "物料：" + materialName);
    }
}
