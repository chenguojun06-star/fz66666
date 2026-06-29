package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.service.MaterialInboundService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class MaterialInboundLogAppendHelper {

    @Autowired
    private MaterialInboundService materialInboundService;

    public void appendOperation(String inboundId, String action, String detail) {
        if (inboundId == null) return;
        OperationLogAppendUtil.appendOperation(
            inboundId,
            materialInboundService,
            MaterialInbound::getRemark,
            MaterialInbound::setRemark,
            action,
            detail,
            "物料入库"
        );
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
