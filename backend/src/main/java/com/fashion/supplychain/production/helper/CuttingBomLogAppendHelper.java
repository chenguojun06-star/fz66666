package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.common.AbstractOperationLogAppendHelper;
import com.fashion.supplychain.production.entity.CuttingBom;
import com.fashion.supplychain.production.service.CuttingBomService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.function.BiConsumer;
import java.util.function.Function;

@Component
public class CuttingBomLogAppendHelper extends AbstractOperationLogAppendHelper<CuttingBom, String> {

    @Autowired
    private CuttingBomService cuttingBomService;

    @Override
    protected IService<CuttingBom> getService() {
        return cuttingBomService;
    }

    @Override
    protected String getEntityName() {
        return "裁剪BOM";
    }

    @Override
    protected Function<CuttingBom, String> getRemarkGetter() {
        return CuttingBom::getRemark;
    }

    @Override
    protected BiConsumer<CuttingBom, String> getRemarkSetter() {
        return CuttingBom::setRemark;
    }

    @Override
    public void appendOperation(String bomId, String action, String detail) {
        super.appendOperation(bomId, action, detail);
    }

    public void appendCreate(String bomId) {
        appendOperation(bomId, "创建裁剪BOM", null);
    }

    public void appendUpdate(String bomId, String fieldNames) {
        appendOperation(bomId, "修改裁剪BOM", "更新字段：" + fieldNames);
    }

    public void appendAddMaterial(String bomId, String materialName) {
        appendOperation(bomId, "添加物料", "物料：" + materialName);
    }

    public void appendRemoveMaterial(String bomId, String materialName) {
        appendOperation(bomId, "移除物料", "物料：" + materialName);
    }
}