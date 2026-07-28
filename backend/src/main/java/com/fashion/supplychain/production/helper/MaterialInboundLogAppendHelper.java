package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.common.AbstractOperationLogAppendHelper;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.service.MaterialInboundService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.function.BiConsumer;
import java.util.function.Function;

@Component
public class MaterialInboundLogAppendHelper extends AbstractOperationLogAppendHelper<MaterialInbound, String> {

    @Autowired
    private MaterialInboundService materialInboundService;

    @Override
    protected IService<MaterialInbound> getService() {
        return materialInboundService;
    }

    @Override
    protected String getEntityName() {
        return "物料入库";
    }

    @Override
    protected Function<MaterialInbound, String> getRemarkGetter() {
        return MaterialInbound::getRemark;
    }

    @Override
    protected BiConsumer<MaterialInbound, String> getRemarkSetter() {
        return MaterialInbound::setRemark;
    }

    @Override
    public void appendOperation(String inboundId, String action, String detail) {
        super.appendOperation(inboundId, action, detail);
    }

    public void appendCreate(String inboundId) {
        appendOperation(inboundId, "创建入库单", null);
    }

    public void appendUpdate(String inboundId, String fieldNames) {
        appendOperation(inboundId, "修改入库单", "更新字段：" + fieldNames);
    }

    public void appendInbound(String inboundId, Integer quantity) {
        appendOperation(inboundId, "确认入库", "入库数量：" + quantity);
    }

    public void appendQualityCheck(String inboundId, String result) {
        appendOperation(inboundId, "质检", "质检结果：" + result);
    }

    public void appendReturn(String inboundId, String reason) {
        appendOperation(inboundId, "退货", "原因：" + reason);
    }

    public void appendCancel(String inboundId, String reason) {
        appendOperation(inboundId, "取消入库", "原因：" + reason);
    }
}