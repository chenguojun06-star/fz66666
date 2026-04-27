package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.system.entity.OrderRemark;
import com.fashion.supplychain.system.service.OrderRemarkService;
import com.fashion.supplychain.websocket.service.WebSocketService;
import java.time.LocalDateTime;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class ProductWarehousingPostActionHelper {

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private OrderRemarkService orderRemarkService;

    @Autowired
    private WebSocketService webSocketService;

    @Autowired
    private com.fashion.supplychain.integration.openapi.service.WebhookPushService webhookPushService;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    public void triggerPostSaveActions(String orderId, ProductWarehousing w) {
        if (!StringUtils.hasText(orderId)) {
            return;
        }
        ensureFinanceAndProgress(orderId, w != null ? w.getId() : null, "save");
        computeSpc(orderId);
        pushWebSocketNotification(w);
        writeQualityRemark(w);
        pushWebhookQualityResult(w);
    }

    public void triggerPostBatchSaveActions(String orderId, int itemCount) {
        if (!StringUtils.hasText(orderId)) {
            return;
        }
        ensureFinanceAndProgress(orderId, null, "batchSave");
    }

    public void triggerPostUpdateActions(String orderId, String warehousingId) {
        if (!StringUtils.hasText(orderId)) {
            return;
        }
        ensureFinanceAndProgress(orderId, warehousingId, "update");
    }

    public void triggerPostDeleteActions(String orderId, String warehousingId) {
        if (!StringUtils.hasText(orderId)) {
            return;
        }
        ensureFinanceAndProgress(orderId, warehousingId, "delete");
        recomputeProgress(orderId, "delete");
    }

    public void updateOrderCompletedQuantity(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            return;
        }
        try {
            int qualifiedSum = productWarehousingService.sumQualifiedByOrderId(orderId);
            com.fashion.supplychain.production.entity.ProductionOrder orderPatch =
                    new com.fashion.supplychain.production.entity.ProductionOrder();
            orderPatch.setId(orderId);
            orderPatch.setCompletedQuantity(qualifiedSum);
            orderPatch.setUpdateTime(LocalDateTime.now());
            productionOrderService.updateById(orderPatch);
        } catch (Exception e) {
            log.warn("更新订单完成数量失败: orderId={}", orderId, e);
        }
    }

    private void ensureFinanceAndProgress(String orderId, String warehousingId, String context) {
        try {
            productionOrderOrchestrator.ensureFinanceRecordsForOrder(orderId);
        } catch (Exception e) {
            log.warn("Failed to ensure finance records after warehousing {}: orderId={}, warehousingId={}",
                    context, orderId, warehousingId, e);
            try {
                scanRecordDomainService.insertOrchestrationFailure(
                        orderId, null, null, null, "ensureFinanceRecords",
                        e == null ? "ensureFinanceRecords failed"
                                : ("ensureFinanceRecords failed: " + e.getMessage()),
                        LocalDateTime.now());
            } catch (Exception ex2) {
                log.warn("记录编排失败也失败: orderId={}", orderId);
            }
        }
        recomputeProgress(orderId, context);
    }

    private void recomputeProgress(String orderId, String context) {
        try {
            productionOrderService.recomputeProgressFromRecords(orderId);
        } catch (Exception ex) {
            log.warn("{}: recomputeProgress失败: orderId={}, error={}", context, orderId, ex.getMessage());
        }
    }

    private void computeSpc(String orderId) {
        try {
            com.fashion.supplychain.production.util.SpcCalculator spcCalc =
                    new com.fashion.supplychain.production.util.SpcCalculator();
            java.util.List<ProductWarehousing> records = productWarehousingService.lambdaQuery()
                    .select(ProductWarehousing::getId, ProductWarehousing::getQualifiedQuantity,
                            ProductWarehousing::getUnqualifiedQuantity, ProductWarehousing::getAqlLevel)
                    .eq(ProductWarehousing::getOrderId, orderId)
                    .eq(ProductWarehousing::getDeleteFlag, 0)
                    .last("LIMIT 200")
                    .list();
            if (records == null || records.size() < 2) return;

            java.util.List<Double> defectRates = new java.util.ArrayList<>();
            for (ProductWarehousing w : records) {
                int total = (w.getQualifiedQuantity() != null ? w.getQualifiedQuantity() : 0)
                          + (w.getUnqualifiedQuantity() != null ? w.getUnqualifiedQuantity() : 0);
                if (total > 0) {
                    int defective = w.getUnqualifiedQuantity() != null ? w.getUnqualifiedQuantity() : 0;
                    defectRates.add((double) defective / total * 100);
                }
            }
            if (defectRates.size() < 2) return;

            java.math.BigDecimal cpk = com.fashion.supplychain.production.util.SpcCalculator.calcCpk(defectRates, 5.0, 0.0);
            java.math.BigDecimal ppk = com.fashion.supplychain.production.util.SpcCalculator.calcPpk(defectRates, 5.0, 0.0);

            productWarehousingService.lambdaUpdate()
                    .eq(ProductWarehousing::getOrderId, orderId)
                    .eq(ProductWarehousing::getDeleteFlag, 0)
                    .set(ProductWarehousing::getCpk, cpk)
                    .set(ProductWarehousing::getPpk, ppk)
                    .update();

            log.info("[SPC] orderId={}, records={}, cpk={}, ppk={}", orderId, records.size(), cpk, ppk);
        } catch (Exception ex) {
            log.warn("[SPC] 入库后Cpk计算失败（不阻断入库）: orderId={}, error={}", orderId, ex.getMessage());
        }
    }

    private void pushWebSocketNotification(ProductWarehousing w) {
        if (w == null) return;
        try {
            String whOrderNo = w.getOrderNo() != null ? w.getOrderNo() : "";
            String bNo = w.getCuttingBundleNo() != null ? String.valueOf(w.getCuttingBundleNo()) : "";
            String opName = w.getWarehousingOperatorName() != null ? w.getWarehousingOperatorName() : "";
            int qty = w.getQualifiedQuantity() != null ? w.getQualifiedQuantity() : 0;
            String processLabel = qty > 0 && (w.getUnqualifiedQuantity() == null || w.getUnqualifiedQuantity() <= 0)
                    ? "质检入库" : "质检记录";
            String whOperatorId = w.getWarehousingOperatorId() != null ? w.getWarehousingOperatorId() : "";
            if (StringUtils.hasText(whOperatorId)) {
                webSocketService.notifyProcessStageCompleted(whOperatorId, whOrderNo, processLabel, opName, bNo, "", "", qty);
            }
        } catch (Exception e) {
            log.debug("save: 工序通知推送失败(不阻断): orderNo={}", w.getOrderNo(), e);
        }
    }

    private void writeQualityRemark(ProductWarehousing w) {
        if (w == null || !StringUtils.hasText(w.getOrderNo())) return;
        try {
            int qualified = w.getQualifiedQuantity() != null ? w.getQualifiedQuantity() : 0;
            int unqualified = w.getUnqualifiedQuantity() != null ? w.getUnqualifiedQuantity() : 0;
            OrderRemark sysRemark = new OrderRemark();
            sysRemark.setTargetType("order");
            sysRemark.setTargetNo(w.getOrderNo());
            sysRemark.setAuthorId("system");
            sysRemark.setAuthorName("系统");
            sysRemark.setAuthorRole("质检");
            sysRemark.setContent("质检入库完成，合格 " + qualified + " 件"
                    + (unqualified > 0 ? "，不合格 " + unqualified + " 件" : ""));
            sysRemark.setTenantId(UserContext.tenantId());
            sysRemark.setCreateTime(LocalDateTime.now());
            sysRemark.setDeleteFlag(0);
            orderRemarkService.save(sysRemark);
        } catch (Exception e) {
            log.warn("自动写入质检入库备注失败，不影响主流程", e);
        }
    }

    private void pushWebhookQualityResult(ProductWarehousing w) {
        if (w == null || !StringUtils.hasText(w.getOrderNo())) return;
        try {
            if (webhookPushService != null) {
                int qualified = w.getQualifiedQuantity() != null ? w.getQualifiedQuantity() : 0;
                int unqualified = w.getUnqualifiedQuantity() != null ? w.getUnqualifiedQuantity() : 0;
                webhookPushService.pushQualityResult(
                        w.getOrderNo(),
                        "质检入库",
                        qualified,
                        unqualified,
                        Map.of("warehouse", w.getWarehouse() != null ? w.getWarehouse() : "",
                               "warehousingNo", w.getWarehousingNo() != null ? w.getWarehousingNo() : ""));
            }
        } catch (Exception e) {
            log.warn("[Webhook] 质检结果推送失败，不影响主流程: {}", e.getMessage());
        }
    }
}
