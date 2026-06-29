package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class MaterialPurchaseLogAppendHelper {

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    public void appendOperation(String purchaseId, String action, String detail) {
        if (purchaseId == null) return;
        OperationLogAppendUtil.appendOperation(
            purchaseId,
            materialPurchaseService,
            MaterialPurchase::getRemark,
            MaterialPurchase::setRemark,
            action,
            detail,
            "物料采购"
        );
    }

    public void appendCreate(String purchaseId) {
        appendOperation(purchaseId, "创建采购单", null);
    }

    public void appendUpdate(String purchaseId, String fieldNames) {
        appendOperation(purchaseId, "修改采购单", "更新字段：" + fieldNames);
    }

    public void appendSubmit(String purchaseId) {
        appendOperation(purchaseId, "提交审核", null);
    }

    public void appendApprove(String purchaseId, String reviewer) {
        appendOperation(purchaseId, "审核通过", "审核人：" + reviewer);
    }

    public void appendReject(String purchaseId, String reviewer, String reason) {
        appendOperation(purchaseId, "审核驳回", "审核人：" + reviewer + "，原因：" + reason);
    }

    public void appendInbound(String purchaseId, Integer inboundQty) {
        appendOperation(purchaseId, "物料入库", "入库数量：" + inboundQty);
    }

    public void appendCancel(String purchaseId, String reason) {
        appendOperation(purchaseId, "取消采购", "原因：" + reason);
    }

    public void appendUrge(String purchaseId) {
        appendOperation(purchaseId, "催货", null);
    }
}
