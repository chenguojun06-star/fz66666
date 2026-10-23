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

    /**
     * D-851：移除物料——原方法写了但 delete() 从未调用（物料被删无任何日志）。
     * 注：appendAddMaterial 已删除——它与 appendCreate 语义重复（新增一条 BOM 明细
     * 就是"添加物料"），保留会造成同一次操作两条日志。
     */
    public void appendRemoveMaterial(String bomId, String materialName) {
        appendOperation(bomId, "移除物料", "物料：" + materialName);
    }
}