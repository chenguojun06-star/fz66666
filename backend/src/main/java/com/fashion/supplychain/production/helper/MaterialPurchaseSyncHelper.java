package com.fashion.supplychain.production.helper;

import java.time.LocalDateTime;
import java.util.List;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.finance.orchestration.MaterialReconciliationOrchestrator;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestratorHelper;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
@RequiredArgsConstructor
public class MaterialPurchaseSyncHelper {

    private final MaterialPurchaseService materialPurchaseService;
    private final MaterialPickingService materialPickingService;
    private final ProductionOrderService productionOrderService;
    private final PatternProductionService patternProductionService;
    private final ProductionOrderOrchestrator productionOrderOrchestrator;
    private final ProductionOrderScanRecordDomainService scanRecordDomainService;
    private final MaterialReconciliationOrchestrator materialReconciliationOrchestrator;
    private final MaterialPurchaseOrchestratorHelper helper;

    public boolean receiveAndSync(String purchaseId, String receiverId, String receiverName) {
        boolean ok = materialPurchaseService.receivePurchase(purchaseId, receiverId, receiverName);
        if (!ok) {
            return false;
        }
        MaterialPurchase updated = getPurchaseWithTenant(purchaseId);
        if (updated != null) {
            syncAfterPurchaseChanged(updated);
        }
        return true;
    }

    public boolean returnConfirmAndSync(String purchaseId, String confirmerId, String confirmerName,
            java.math.BigDecimal returnQuantity) {
        boolean ok = materialPurchaseService.confirmReturnPurchase(purchaseId, confirmerId, confirmerName,
                returnQuantity);
        if (!ok) {
            return false;
        }
        MaterialPurchase updated = materialPurchaseService.getOne(
                new LambdaQueryWrapper<MaterialPurchase>()
                        .select(MaterialPurchase::getId, MaterialPurchase::getDeleteFlag,
                                MaterialPurchase::getOrderId, MaterialPurchase::getOrderNo,
                                MaterialPurchase::getStyleId, MaterialPurchase::getStyleNo,
                                MaterialPurchase::getStatus)
                        .eq(MaterialPurchase::getId, purchaseId));
        if (updated != null) {
            syncAfterPurchaseChanged(updated);
            tryMarkOrderProcurementComplete(updated);
        }
        return true;
    }

    public void syncAfterPurchaseChanged(MaterialPurchase purchase) {
        if (purchase == null) {
            return;
        }

        boolean allowReconciliation = !StringUtils.hasText(purchase.getOrderId())
                || isInternalOrderPurchase(purchase);
        if (allowReconciliation && StringUtils.hasText(purchase.getId())) {
            try {
                materialReconciliationOrchestrator.upsertFromPurchaseId(purchase.getId().trim());
            } catch (Exception e) {
                log.warn("Failed to upsert material reconciliation after purchase changed: purchaseId={}, orderId={}",
                        purchase.getId(),
                        purchase.getOrderId(),
                        e);
                scanRecordDomainService.insertOrchestrationFailure(
                        purchase.getOrderId(),
                        purchase.getOrderNo(),
                        purchase.getStyleId(),
                        purchase.getStyleNo(),
                        "upsertMaterialReconciliation",
                        e == null ? "upsertMaterialReconciliation failed"
                                : ("upsertMaterialReconciliation failed: " + e.getMessage()),
                        LocalDateTime.now());
            }
        }

        String orderId = resolveOrderId(purchase);
        if (StringUtils.hasText(orderId)) {
            String oid = orderId.trim();
            try {
                helper.ensureOrderStatusProduction(oid);
            } catch (Exception e) {
                log.warn("syncAfterPurchaseChanged: ensureOrderStatusProduction failed, orderId={}, error={}", oid, e.getMessage());
            }
            try {
                helper.recomputeAndUpdateMaterialArrivalRate(oid, productionOrderOrchestrator);
            } catch (Exception e) {
                log.warn("syncAfterPurchaseChanged: recomputeAndUpdateMaterialArrivalRate failed, orderId={}, error={}", oid, e.getMessage());
            }
            try {
                productionOrderService.recomputeProgressFromRecords(oid);
            } catch (Exception e) {
                log.warn("syncAfterPurchaseChanged: recomputeProgressFromRecords failed, orderId={}, error={}", oid, e.getMessage());
            }
        }
    }

    public void syncAfterResetReturnConfirm(String purchaseId, MaterialPurchase purchase) {
        try {
            materialReconciliationOrchestrator.upsertFromPurchaseId(purchaseId);
        } catch (Exception e) {
            log.warn("Failed to upsert material reconciliation after return confirm reset: purchaseId={}", purchaseId, e);
            scanRecordDomainService.insertOrchestrationFailure(
                    purchase.getOrderId(), purchase.getOrderNo(),
                    purchase.getStyleId(), purchase.getStyleNo(),
                    "upsertMaterialReconciliation",
                    e == null ? "upsertMaterialReconciliation failed"
                            : ("upsertMaterialReconciliation failed: " + e.getMessage()),
                    LocalDateTime.now());
        }
    }

    public void syncAfterCancelReceive(String purchaseId, MaterialPurchase purchase) {
        materialReconciliationOrchestrator.upsertFromPurchaseId(purchaseId);
        log.info("cancelReceive 已同步物料对账: purchaseId={}", purchaseId);
        String orderId = resolveOrderId(purchase);
        if (StringUtils.hasText(orderId)) {
            helper.recomputeAndUpdateMaterialArrivalRate(orderId, productionOrderOrchestrator);
            log.info("cancelReceive 已重算面料到货率: orderId={}", orderId);
        }
    }

    public void tryMarkOrderProcurementComplete(MaterialPurchase purchase) {
        String oid = resolveOrderId(purchase);
        if (!org.springframework.util.StringUtils.hasText(oid)) return;
        try {
            long inProgressCount = materialPurchaseService.count(
                    new LambdaQueryWrapper<MaterialPurchase>()
                            .eq(MaterialPurchase::getOrderId, oid)
                            .ne(MaterialPurchase::getDeleteFlag, 1)
                            .notIn(MaterialPurchase::getStatus,
                                    MaterialConstants.STATUS_COMPLETED,
                                    MaterialConstants.STATUS_CANCELLED));
            if (inProgressCount > 0) return;

            // P1-3: 检查是否存在待确认出库的领料单，有则不标记采购完成
            long pendingPickingCount = materialPickingService.count(
                    new LambdaQueryWrapper<com.fashion.supplychain.production.entity.MaterialPicking>()
                            .eq(com.fashion.supplychain.production.entity.MaterialPicking::getOrderId, oid)
                            .eq(com.fashion.supplychain.production.entity.MaterialPicking::getStatus, "pending")
                            .eq(com.fashion.supplychain.production.entity.MaterialPicking::getDeleteFlag, 0));
            if (pendingPickingCount > 0) {
                log.info("采购阶段暂不标记完成（存在待确认出库的领料单）: orderId={}, pendingPickingCount={}", oid, pendingPickingCount);
                return;
            }

            ProductionOrder existOrder = productionOrderService.getOne(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId, ProductionOrder::getProcurementManuallyCompleted)
                            .eq(ProductionOrder::getId, oid),
                    false);
            if (existOrder == null) return;
            if (existOrder.getProcurementManuallyCompleted() != null
                    && existOrder.getProcurementManuallyCompleted() == 1) return;

            LocalDateTime actualLastCompletedAt = queryMaxPurchaseUpdateTime(oid);
            LocalDateTime confirmedAt = (actualLastCompletedAt != null) ? actualLastCompletedAt : LocalDateTime.now();

            LambdaUpdateWrapper<ProductionOrder> ouw = new LambdaUpdateWrapper<>();
            ouw.eq(ProductionOrder::getId, oid)
               .set(ProductionOrder::getProcurementManuallyCompleted, 1)
               .set(ProductionOrder::getProcurementConfirmedAt, confirmedAt)
               .set(ProductionOrder::getProcurementConfirmedBy, UserContext.userId())
               .set(ProductionOrder::getProcurementConfirmedByName, UserContext.username());
            productionOrderService.update(ouw);
            log.info("✅ 所有采购单已完成，订单采购自动标记手工确认: orderId={}, confirmedAt={}", oid, confirmedAt);
        } catch (Exception e) {
            log.warn("[confirmComplete] 自动标记采购手工完成失败（不影响主流程）: orderId={}, error={}", oid, e.getMessage());
        }
    }

    private String resolveOrderId(MaterialPurchase purchase) {
        if (StringUtils.hasText(purchase.getOrderId())) {
            return purchase.getOrderId().trim();
        }
        if ("sample".equals(purchase.getSourceType()) && StringUtils.hasText(purchase.getPatternProductionId())) {
            try {
                PatternProduction pp = patternProductionService.getById(purchase.getPatternProductionId().trim());
                if (pp != null && StringUtils.hasText(pp.getProductionOrderId())) {
                    return pp.getProductionOrderId().trim();
                }
            } catch (Exception e) {
                log.warn("[resolveOrderId] 样衣采购解析关联订单失败 patternProductionId={}, error={}",
                        purchase.getPatternProductionId(), e.getMessage());
            }
        }
        return null;
    }

    public LocalDateTime queryMaxPurchaseUpdateTime(String orderId) {
        try {
            List<MaterialPurchase> purchases = materialPurchaseService.list(
                    new LambdaQueryWrapper<MaterialPurchase>()
                            .select(MaterialPurchase::getUpdateTime)
                            .eq(MaterialPurchase::getOrderId, orderId)
                            .ne(MaterialPurchase::getDeleteFlag, 1)
                            .in(MaterialPurchase::getStatus,
                                    MaterialConstants.STATUS_COMPLETED,
                                    MaterialConstants.STATUS_CANCELLED));
            return purchases.stream()
                    .map(MaterialPurchase::getUpdateTime)
                    .filter(t -> t != null)
                    .max(java.util.Comparator.naturalOrder())
                    .orElse(null);
        } catch (Exception e) {
            log.warn("queryMaxPurchaseUpdateTime failed for orderId={}: {}", orderId, e.getMessage());
            return null;
        }
    }

    /**
     * 判定该采购是否属于「内部工厂采购」（决定是否生成物料对账单）。
     *
     * <p>D-252：判定口径必须与
     * {@code MaterialReconciliationOrchestrator#isInternalFactoryPurchase} 完全一致
     * ——「只有明确 EXTERNAL 才是外发」，NULL / 未标注 / INTERNAL 均按内部处理。
     * 两处口径此前都是「必须等于 INTERNAL」，导致 factory_type 为 NULL 的订单
     * （本厂 / 最美服装工厂等）被误判为外发，对账被整批跳过。
     *
     * <p>同时按 P0 铁律 #7 补 tenantId 隔离：原实现用 getById 不带租户过滤。
     */
    public boolean isInternalOrderPurchase(MaterialPurchase purchase) {
        if (purchase == null || !StringUtils.hasText(purchase.getOrderId())) {
            return false;
        }
        if (StringUtils.hasText(purchase.getFactoryType())) {
            return !"EXTERNAL".equalsIgnoreCase(purchase.getFactoryType().trim());
        }
        try {
            Long tenantId = UserContext.tenantId();
            ProductionOrder order = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getId, purchase.getOrderId().trim())
                    .eq(tenantId != null, ProductionOrder::getTenantId, tenantId)
                    .one();
            // 订单缺失或 factory_type 未标注（NULL）→ 按内部处理，保证对账不丢
            if (order == null || !StringUtils.hasText(order.getFactoryType())) {
                return true;
            }
            return !"EXTERNAL".equalsIgnoreCase(order.getFactoryType().trim());
        } catch (Exception e) {
            log.warn("syncAfterPurchaseChanged: 识别内部订单失败，按内部处理（保证对账不丢）purchaseId={}, orderId={}",
                    purchase.getId(), purchase.getOrderId(), e);
            return true;
        }
    }

    private MaterialPurchase getPurchaseWithTenant(String purchaseId) {
        return materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getId, purchaseId)
                .eq(MaterialPurchase::getTenantId, UserContext.tenantId())
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .one();
    }
}
