package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 采购操作日志追加
 * 双写策略：MaterialPurchase.remark + ProductionOrder.remarks（用户要求所有操作记录都进订单备注时间线）
 */
@Slf4j
@Component
public class MaterialPurchaseLogAppendHelper {

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private OrderRemarkHelper orderRemarkHelper;

    public void appendOperation(String purchaseId, String action, String detail) {
        if (purchaseId == null) return;
        // 1. 写 MaterialPurchase.remark
        OperationLogAppendUtil.appendOperation(
            purchaseId,
            materialPurchaseService,
            MaterialPurchase::getRemark,
            MaterialPurchase::setRemark,
            action,
            detail,
            "物料采购"
        );
        // 2. 同步到 ProductionOrder.remarks
        syncToProductionOrder(purchaseId, action, detail);
    }

    /**
     * 仅写 ProductionOrder.remarks（用于 cancelReceive 等已自己写了 MaterialPurchase.remark 的场景）
     */
    public void appendOrderOnly(String purchaseId, String action, String detail) {
        if (purchaseId == null) return;
        syncToProductionOrder(purchaseId, action, detail);
    }

    private void syncToProductionOrder(String purchaseId, String action, String detail) {
        try {
            MaterialPurchase p = materialPurchaseService.getById(purchaseId);
            if (p == null) return;
            String orderId = p.getOrderId();
            if (orderId == null || orderId.trim().isEmpty()) return;
            ProductionOrder order = productionOrderService.getById(orderId);
            if (order == null) return;
            // 拼物料名前缀，方便在订单备注时间线识别
            String materialName = p.getMaterialName();
            String richDetail = detail;
            if (materialName != null && !materialName.isEmpty()) {
                richDetail = (detail == null ? "" : detail) + "（物料：" + materialName + "）";
            }
            orderRemarkHelper.append(order, action, richDetail);
        } catch (Exception e) {
            log.debug("[PurchaseLog] 同步到订单备注失败（不阻断）: purchaseId={}, action={}, err={}",
                    purchaseId, action, e.getMessage());
        }
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

    /** 领取采购任务 */
    public void appendReceive(String purchaseId, String receiverName) {
        appendOperation(purchaseId, "领取采购任务", "领取人：" + receiverName);
    }

    /** 撤回采购领取（cancelReceive 已自己写了 remark，这里只同步到订单备注） */
    public void appendCancelReceive(String purchaseId, String reason) {
        appendOrderOnly(purchaseId, "撤回采购领取", "原因：" + reason);
    }

    /** 批量领取采购任务 */
    public void appendBatchReceive(List<String> purchaseIds, String receiverName, int successCount, int skipCount) {
        if (purchaseIds == null || purchaseIds.isEmpty()) return;
        String detail = "领取人：" + receiverName + "，成功：" + successCount + "，跳过：" + skipCount + "，共：" + purchaseIds.size();
        for (String pid : purchaseIds) {
            // 每条都同步到对应订单备注
            try {
                MaterialPurchase p = materialPurchaseService.getById(pid);
                if (p == null) continue;
                String orderId = p.getOrderId();
                if (orderId == null || orderId.trim().isEmpty()) continue;
                ProductionOrder order = productionOrderService.getById(orderId);
                if (order == null) continue;
                String richDetail = detail + "（物料：" + (p.getMaterialName() == null ? "" : p.getMaterialName()) + "）";
                orderRemarkHelper.append(order, "批量领取采购", richDetail);
            } catch (Exception e) {
                log.debug("[PurchaseLog] batchReceive 同步订单备注失败: pid={}, err={}", pid, e.getMessage());
            }
        }
    }

    /** 确认采购完成 */
    public void appendConfirmComplete(String purchaseId) {
        appendOperation(purchaseId, "确认采购完成", null);
    }

    /** 智能领取（订单维度） */
    public void appendSmartReceive(String orderId, int successCount) {
        if (orderId == null || orderId.trim().isEmpty()) return;
        try {
            ProductionOrder order = productionOrderService.getById(orderId.trim());
            if (order == null) return;
            orderRemarkHelper.append(order, "智能领取采购", "成功领取数：" + successCount);
        } catch (Exception e) {
            log.debug("[PurchaseLog] smartReceive 同步订单备注失败: orderId={}, err={}", orderId, e.getMessage());
        }
    }

    /** 智能领取（按订单号） */
    public void appendSmartReceiveByOrderNo(String orderNo, int successCount) {
        if (orderNo == null || orderNo.trim().isEmpty()) return;
        try {
            ProductionOrder order = productionOrderService.getByOrderNo(orderNo.trim());
            if (order == null) return;
            orderRemarkHelper.append(order, "智能领取采购", "成功领取数：" + successCount);
        } catch (Exception e) {
            log.debug("[PurchaseLog] smartReceiveByOrderNo 同步订单备注失败: orderNo={}, err={}", orderNo, e.getMessage());
        }
    }
}
