package com.fashion.supplychain.style.helper;

import com.fashion.supplychain.common.AbstractOperationLogAppendHelper;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.service.StyleBomService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.function.BiConsumer;
import java.util.function.Function;

/**
 * 款式BOM操作日志追加
 * P0铁律#6: 操作日志必须记录关键业务操作
 *
 * 注意：款式级操作（同步物料库/生成采购任务/库存检查）必须写入 t_style_operation_log（经 StyleLogHelper），
 * 严禁 append 到 t_style_info.description —— 该字段是"生产要求"业务字段，曾被日志污染（D-069）。
 */
@Component
public class StyleBomLogAppendHelper extends AbstractOperationLogAppendHelper<StyleBom, String> {

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleLogHelper styleLogHelper;

    @Override
    protected StyleBomService getService() {
        return styleBomService;
    }

    @Override
    protected String getEntityName() {
        return "BOM记录";
    }

    @Override
    protected Function<StyleBom, String> getRemarkGetter() {
        return StyleBom::getRemark;
    }

    @Override
    protected BiConsumer<StyleBom, String> getRemarkSetter() {
        return StyleBom::setRemark;
    }

    private void appendStyleOperation(Long styleId, String action, String detail) {
        if (styleId == null) {
            return;
        }
        // D-069: 写入样式操作日志表，禁止污染生产要求(description)字段
        styleLogHelper.saveStyleLog(styleId, action, detail);
    }

    public void appendSave(String bomId, int itemCount) {
        appendOperation(bomId, "新增BOM物料", "新增数量：" + itemCount + "项");
    }

    public void appendUpdate(String bomId, String detail) {
        appendOperation(bomId, "修改BOM物料", detail);
    }

    public void appendDelete(String bomId, String materialCode) {
        appendOperation(bomId, "删除BOM物料", "物料编码：" + materialCode);
    }

    public void appendSyncToMaterial(Long styleId, int syncedCount) {
        appendStyleOperation(styleId, "BOM同步物料库", "同步数量：" + syncedCount + "项");
    }

    public void appendGeneratePurchase(Long styleId, int purchaseCount) {
        appendStyleOperation(styleId, "生成采购任务", "生成数量：" + purchaseCount + "个");
    }

    public void appendStockCheck(Long styleId, int totalCount, int sufficientCount) {
        appendStyleOperation(styleId, "BOM库存检查", "总计" + totalCount + "项，其中库存充足" + sufficientCount + "项");
    }
}