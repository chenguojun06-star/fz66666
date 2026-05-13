package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.warehouse.entity.StockChangeLog;
import com.fashion.supplychain.warehouse.service.StockChangeLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

import com.fashion.supplychain.production.service.impl.ProductWarehousingHelper;
import static com.fashion.supplychain.production.service.impl.ProductWarehousingHelper.*;

@Component
@Slf4j
@RequiredArgsConstructor
public class WarehousingWriteHelper {

    private final ProductionOrderService productionOrderService;
    private final CuttingBundleService cuttingBundleService;
    private final ProductWarehousingHelper helper;
    private final com.fashion.supplychain.websocket.service.WebSocketService webSocketService;
    private final StockChangeLogService stockChangeLogService;

    public ProductionOrder validateOrderForSave(ProductWarehousing pw) {
        if (!StringUtils.hasText(pw.getOrderId())) {
            throw new IllegalArgumentException("订单ID不能为空");
        }
        Long tenantId = UserContext.tenantId();
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getId, pw.getOrderId())
                .eq(ProductionOrder::getTenantId, tenantId)
                .one();
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("订单不存在");
        }
        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if (OrderStatusConstants.isTerminal(st)) {
            throw new IllegalStateException("订单已终态(" + st + ")，已停止入库");
        }
        return order;
    }

    public ProductionOrder validateOrderForSaveById(String orderId) {
        Long tenantId = UserContext.tenantId();
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getId, orderId)
                .eq(ProductionOrder::getTenantId, tenantId)
                .one();
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("订单不存在");
        }
        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if (OrderStatusConstants.isTerminal(st)) {
            throw new IllegalStateException("订单已完成，已停止入库");
        }
        return order;
    }

    public void resolveWarehousingNo(ProductWarehousing pw, ProductionOrder order) {
        String existingNo = helper.findExistingWarehousingNoByOrderId(order.getId());
        if (StringUtils.hasText(existingNo)) {
            pw.setWarehousingNo(existingNo);
        }
    }

    public String validateAndNormalizeQuantities(ProductWarehousing pw) {
        int qualified = pw.getQualifiedQuantity() == null ? 0 : pw.getQualifiedQuantity();
        int unqualified = pw.getUnqualifiedQuantity() == null ? 0 : pw.getUnqualifiedQuantity();
        if (qualified < 0 || unqualified < 0) {
            throw new IllegalArgumentException("数量不能为负数");
        }
        int warehousingQty = pw.getWarehousingQuantity() == null ? (qualified + unqualified) : pw.getWarehousingQuantity();
        if (warehousingQty <= 0) {
            throw new IllegalArgumentException("入库数量必须大于0");
        }
        if (qualified + unqualified != warehousingQty) {
            throw new IllegalArgumentException("入库数量必须等于合格数量+不合格数量");
        }
        pw.setWarehousingQuantity(warehousingQty);
        pw.setQualifiedQuantity(qualified);
        pw.setUnqualifiedQuantity(unqualified);
        return unqualified > 0 ? STATUS_UNQUALIFIED : STATUS_QUALIFIED;
    }

    public record BundleResolveResult(CuttingBundle bundle, boolean blocked, String repairRemark) {}

    public BundleResolveResult resolveBundleAndValidateRepair(ProductWarehousing pw, ProductionOrder order,
            String computedQualityStatus, String repairRemark) {
        CuttingBundle bundle = null;
        boolean bundleIsBlocked = false;
        String bundleId = StringUtils.hasText(pw.getCuttingBundleId()) ? pw.getCuttingBundleId().trim() : null;
        String bundleQr = StringUtils.hasText(pw.getCuttingBundleQrCode()) ? pw.getCuttingBundleQrCode().trim() : null;

        if (!StringUtils.hasText(bundleId) && !StringUtils.hasText(bundleQr)) {
            return new BundleResolveResult(null, false, repairRemark);
        }

        if (StringUtils.hasText(bundleId)) {
            bundle = cuttingBundleService.getById(bundleId);
        }
        if (bundle == null && StringUtils.hasText(bundleQr)) {
            bundle = cuttingBundleService.getByQrCode(bundleQr);
        }
        if (bundle == null || !StringUtils.hasText(bundle.getId())) {
            throw new NoSuchElementException("未找到对应的菲号");
        }
        if (StringUtils.hasText(bundle.getProductionOrderId())
                && !order.getId().trim().equals(bundle.getProductionOrderId().trim())) {
            throw new IllegalArgumentException("菲号与订单不匹配");
        }

        bundleIsBlocked = helper.isBundleBlockedForWarehousing(bundle.getStatus());
        if (bundleIsBlocked && !STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)) {
            throw new IllegalStateException("温馨提示：该菲号是次品待返修状态，返修完成后才可以入库哦～");
        }
        if (bundleIsBlocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus) && !StringUtils.hasText(repairRemark)) {
            repairRemark = "返修检验合格";
            pw.setRepairRemark(repairRemark);
        }
        if (bundleIsBlocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus) && StringUtils.hasText(repairRemark)) {
            validateRepairReQcQuantity(order.getId(), bundle.getId(), pw.getWarehousingQuantity(), null);
        }

        pw.setCuttingBundleId(bundle.getId());
        pw.setCuttingBundleNo(bundle.getBundleNo());
        pw.setCuttingBundleQrCode(bundle.getQrCode());
        helper.ensureBundleNotAlreadyQualifiedWarehoused(order.getId(), bundle.getId(), null);

        return new BundleResolveResult(bundle, bundleIsBlocked, repairRemark);
    }

    public void validateRepairReQcQuantity(String orderId, String bundleId, int warehousingQty, String excludeId) {
        int[] bd = helper.calcRepairBreakdown(orderId, bundleId, excludeId);
        int remaining = Math.max(0, bd[1] - bd[2]);
        int repairPool = bd[0];
        int availableQty = Math.max(remaining, repairPool);
        if (availableQty <= 0) {
            throw new IllegalStateException("该菲号无次品需要重新质检");
        }
        if (warehousingQty > availableQty) {
            throw new IllegalStateException("该菲号可返修入库数量为" + availableQty + "，不能超过可质检数量");
        }
    }

    public void validateQuantityRange(ProductionOrder order, int warehousingQty,
            boolean bundleIsBlocked, String computedQualityStatus, String repairRemark, boolean skipRangeCheck) {
        if (skipRangeCheck) return;
        boolean isRepairReQc = (bundleIsBlocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus))
                || StringUtils.hasText(repairRemark);
        if (!isRepairReQc) {
            String msg = helper.warehousingQuantityRuleViolationMessage(order.getId(), warehousingQty, null);
            if (StringUtils.hasText(msg)) {
                throw new IllegalStateException(msg);
            }
        }
    }

    public void fillDefaultFields(ProductWarehousing pw, ProductionOrder order, LocalDateTime now) {
        if (!StringUtils.hasText(pw.getOrderNo())) pw.setOrderNo(order.getOrderNo());
        if (!StringUtils.hasText(pw.getStyleId())) pw.setStyleId(order.getStyleId());
        if (!StringUtils.hasText(pw.getStyleNo())) pw.setStyleNo(order.getStyleNo());
        if (!StringUtils.hasText(pw.getStyleName())) pw.setStyleName(order.getStyleName());
        if (!StringUtils.hasText(pw.getWarehousingNo())) pw.setWarehousingNo(helper.buildWarehousingNo(now));
        if (!StringUtils.hasText(pw.getWarehousingType())) pw.setWarehousingType(WAREHOUSING_TYPE_MANUAL);
        if (pw.getWarehousingStartTime() == null) pw.setWarehousingStartTime(now);
        if (pw.getWarehousingEndTime() == null) pw.setWarehousingEndTime(now);
        if (!StringUtils.hasText(pw.getWarehousingOperatorId()) && StringUtils.hasText(pw.getReceiverId())) {
            pw.setWarehousingOperatorId(pw.getReceiverId());
        }
        if (!StringUtils.hasText(pw.getWarehousingOperatorName()) && StringUtils.hasText(pw.getReceiverName())) {
            pw.setWarehousingOperatorName(pw.getReceiverName());
        }
        pw.setCreateTime(now);
        pw.setUpdateTime(now);
        pw.setDeleteFlag(0);
    }

    public void executePostSaveSideEffects(ProductWarehousing pw, ProductionOrder order,
            CuttingBundle bundle, String computedQualityStatus, String repairRemark, LocalDateTime now) {
        updateBundleAfterSave(bundle, pw, computedQualityStatus, repairRemark, now);
        syncOrderCompletedQuantity(pw.getOrderId());
        upsertScanRecords(pw, order, bundle, now);
        updateSkuStockAfterSave(pw, order, bundle);
        broadcastWarehousingNotification(pw, order);
    }

    public void updateBundleAfterSave(CuttingBundle bundle, ProductWarehousing pw,
            String computedQualityStatus, String repairRemark, LocalDateTime now) {
        if (bundle == null || !StringUtils.hasText(bundle.getId())) return;
        try {
            helper.updateBundleStatusAfterWarehousing(bundle, computedQualityStatus, repairRemark, now);
        } catch (Exception e) {
            log.warn("更新菲号状态失败（不阻断入库）: bundleId={}, orderId={}", bundle.getId(), pw.getOrderId(), e);
        }
        if (helper.isBundleBlockedForWarehousing(bundle.getStatus()) && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)) {
            try {
                helper.resolveDefectRecordsAfterReQc(pw.getOrderId(), bundle.getId(), pw.getId());
            } catch (Exception e) {
                log.warn("清理旧次品记录失败（不阻断）: orderId={}, bundleId={}", pw.getOrderId(), bundle.getId(), e);
            }
        }
    }

    public void syncOrderCompletedQuantity(String orderId) {
        try {
            int qualifiedSum = helper.sumQualifiedByOrderId(orderId);
            ProductionOrder patch = new ProductionOrder();
            patch.setId(orderId);
            patch.setCompletedQuantity(qualifiedSum);
            patch.setUpdateTime(LocalDateTime.now());
            productionOrderService.updateById(patch);
        } catch (Exception e) {
            log.warn("更新订单完成数量失败（不阻断入库）: orderId={}", orderId, e);
        }
    }

    public void upsertScanRecords(ProductWarehousing pw, ProductionOrder order, CuttingBundle bundle, LocalDateTime now) {
        try {
            helper.upsertWarehousingStageScanRecord(pw, order, bundle, now);
        } catch (Exception e) {
            log.warn("Failed to upsert warehousing stage scan record: warehousingId={}, orderId={}",
                    pw == null ? null : pw.getId(), pw == null ? null : pw.getOrderId(), e);
        }
        try {
            helper.upsertWarehouseScanRecord(pw, order, bundle, now);
        } catch (Exception e) {
            log.warn("Failed to upsert warehouse scan record: warehousingId={}, orderId={}",
                    pw == null ? null : pw.getId(), pw == null ? null : pw.getOrderId(), e);
        }
    }

    public void updateSkuStockAfterSave(ProductWarehousing pw, ProductionOrder order, CuttingBundle bundle) {
        if (pw.getQualifiedQuantity() != null && pw.getQualifiedQuantity() > 0) {
            try {
                helper.updateSkuStock(pw, order, bundle, pw.getQualifiedQuantity());
            } catch (Exception e) {
                log.warn("更新SKU库存失败（不阻断入库）: orderId={}", pw.getOrderId(), e);
            }
            try {
                StockChangeLog scl = new StockChangeLog();
                scl.setId(UUID.randomUUID().toString().replace("-", ""));
                scl.setChangeNo(buildChangeNo("SC"));
                scl.setChangeType("INBOUND");
                scl.setStockType("FINISHED");
                scl.setStyleNo(pw.getStyleNo());
                scl.setColor(pw.getColor());
                scl.setSize(pw.getSize());
                scl.setChangeQuantity(BigDecimal.valueOf(pw.getQualifiedQuantity()));
                scl.setBizType("production_order");
                scl.setBizNo(pw.getWarehousingNo());
                scl.setTraceId(pw.getTraceId());
                scl.setOperatorId(UserContext.userId());
                scl.setOperatorName(UserContext.username());
                scl.setTenantId(UserContext.tenantId());
                scl.setCreateTime(LocalDateTime.now());
                stockChangeLogService.save(scl);
            } catch (Exception e) {
                log.warn("记录库存变动日志失败（不阻断入库）: orderId={}", pw.getOrderId(), e);
            }
        }
    }

    private String buildChangeNo(String prefix) {
        return prefix + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
                + Integer.toHexString(ThreadLocalRandom.current().nextInt(0x1000, 0x10000))
                .toUpperCase();
    }

    public void broadcastWarehousingNotification(ProductWarehousing pw, ProductionOrder order) {
        try {
            String orderNo = pw.getOrderNo() != null ? pw.getOrderNo() : order.getOrderNo();
            String warehouse = pw.getWarehouse() != null ? pw.getWarehouse() : "";
            int qty = pw.getQualifiedQuantity() != null ? pw.getQualifiedQuantity() : 0;
            String operatorId = pw.getQualityOperatorId() != null ? pw.getQualityOperatorId() : "";
            webSocketService.notifyWarehouseIn(operatorId, orderNo, qty, warehouse);
            webSocketService.notifyOrderProgressChanged(operatorId, orderNo, 0, "入库");
            webSocketService.notifyDataChanged(operatorId, "ProductWarehousing", pw.getId(), "create");
        } catch (Exception e) {
            log.warn("入库WebSocket广播失败（不阻断入库）: orderId={}", pw.getOrderId(), e);
        }
    }

    public void validateOrderNotTerminal(String orderId) {
        if (!StringUtils.hasText(orderId)) return;
        Long tenantId = UserContext.tenantId();
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getId, orderId)
                .eq(ProductionOrder::getTenantId, tenantId)
                .one();
        String st = order == null ? "" : (order.getStatus() == null ? "" : order.getStatus().trim());
        if (OrderStatusConstants.isTerminal(st)) {
            throw new IllegalStateException("订单已完成，已停止入库");
        }
    }

    public String validateAndNormalizeUpdateQuantities(ProductWarehousing pw, ProductWarehousing oldW) {
        Integer uq = pw.getUnqualifiedQuantity() != null ? pw.getUnqualifiedQuantity() : oldW.getUnqualifiedQuantity();
        Integer qq = pw.getQualifiedQuantity() != null ? pw.getQualifiedQuantity() : oldW.getQualifiedQuantity();
        Integer wq = pw.getWarehousingQuantity() != null ? pw.getWarehousingQuantity() : oldW.getWarehousingQuantity();
        int unqualified = uq == null ? 0 : uq;
        int qualified = qq == null ? 0 : qq;
        int warehousingQty = wq == null ? (qualified + unqualified) : wq;
        if (qualified < 0 || unqualified < 0) throw new IllegalArgumentException("数量不能为负数");
        if (warehousingQty <= 0) throw new IllegalArgumentException("入库数量必须大于0");
        if (qualified + unqualified != warehousingQty) throw new IllegalArgumentException("入库数量必须等于合格数量+不合格数量");
        pw.setWarehousingQuantity(warehousingQty);
        pw.setQualifiedQuantity(qualified);
        pw.setUnqualifiedQuantity(unqualified);
        return unqualified > 0 ? STATUS_UNQUALIFIED : STATUS_QUALIFIED;
    }

    public void validateUpdateQuantityRange(ProductWarehousing oldW, int warehousingQty) {
        if (!StringUtils.hasText(oldW.getOrderId())) return;
        String msg = helper.warehousingQuantityRuleViolationMessage(oldW.getOrderId(), warehousingQty, oldW.getId());
        if (StringUtils.hasText(msg)) throw new IllegalStateException(msg);
    }

    public void validateBundleNotAlreadyWarehoused(ProductWarehousing pw, ProductWarehousing oldW) {
        if (StringUtils.hasText(pw.getCuttingBundleId())
                && (oldW.getCuttingBundleId() == null || !pw.getCuttingBundleId().trim().equals(oldW.getCuttingBundleId().trim()))) {
            String oid = StringUtils.hasText(oldW.getOrderId()) ? oldW.getOrderId().trim() : null;
            helper.ensureBundleNotAlreadyQualifiedWarehoused(oid, pw.getCuttingBundleId(), oldW.getId());
        }
    }

    public CuttingBundle loadBundleForUpdate(ProductWarehousing pw, ProductWarehousing oldW) {
        String bid = StringUtils.hasText(pw.getCuttingBundleId()) ? pw.getCuttingBundleId().trim()
                : (StringUtils.hasText(oldW.getCuttingBundleId()) ? oldW.getCuttingBundleId().trim() : null);
        if (!StringUtils.hasText(bid)) return null;
        try {
            return cuttingBundleService.getById(bid);
        } catch (Exception e) {
            log.warn("Failed to load cutting bundle when updating warehousing: cuttingBundleId={}", bid, e);
            return null;
        }
    }

    public void handleUpdateSkuStockDiff(ProductWarehousing pw, ProductWarehousing oldW, CuttingBundle bundle) {
        int oldQ = oldW.getQualifiedQuantity() == null ? 0 : oldW.getQualifiedQuantity();
        int newQ = pw.getQualifiedQuantity();
        int diff = newQ - oldQ;
        if (diff == 0) return;
        ProductionOrder order = null;
        if (StringUtils.hasText(oldW.getOrderId())) {
            Long tenantId = UserContext.tenantId();
            order = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getId, oldW.getOrderId())
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .one();
        }
        helper.updateSkuStock(pw, order, bundle, diff);
    }

    public void handleUpdateBundleSideEffects(ProductWarehousing pw, ProductWarehousing oldW,
            CuttingBundle bundle, String computedQualityStatus, LocalDateTime now) {
        if (bundle == null || !StringUtils.hasText(bundle.getId())) return;

        String repairRemark = helper.trimToNull(pw.getRepairRemark());
        if (repairRemark == null) repairRemark = helper.trimToNull(oldW.getRepairRemark());

        boolean blocked = helper.isBundleBlockedForWarehousing(bundle.getStatus());
        if (blocked && !STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)) {
            throw new IllegalStateException("温馨提示：该菲号是次品待返修状态，返修完成后才可以入库哦～");
        }
        if (blocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus) && !StringUtils.hasText(repairRemark)) {
            repairRemark = "返修检验合格";
            pw.setRepairRemark(repairRemark);
        }
        if (blocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus) && StringUtils.hasText(repairRemark)) {
            String oid = StringUtils.hasText(oldW.getOrderId()) ? oldW.getOrderId().trim() : null;
            validateRepairReQcQuantity(oid, bundle.getId(), pw.getWarehousingQuantity(), oldW.getId());
        }
        helper.updateBundleStatusAfterWarehousing(bundle, computedQualityStatus, repairRemark, now);

        if (blocked && STATUS_QUALIFIED.equalsIgnoreCase(computedQualityStatus)) {
            try {
                helper.resolveDefectRecordsAfterReQc(oldW.getOrderId(), bundle.getId(), oldW.getId());
            } catch (Exception e) {
                log.warn("清理旧次品记录失败（不阻断）: orderId={}, bundleId={}", oldW.getOrderId(), bundle.getId(), e);
            }
        }
    }

    public ProductWarehousing buildCurrentForScanRecord(ProductWarehousing pw, ProductWarehousing oldW,
            ProductionOrder order, String computedQualityStatus, int qualified, int warehousingQty, int unqualified) {
        ProductWarehousing current = new ProductWarehousing();
        current.setId(oldW.getId());
        current.setOrderId(oldW.getOrderId());
        current.setOrderNo(StringUtils.hasText(oldW.getOrderNo()) ? oldW.getOrderNo() : order.getOrderNo());
        current.setStyleId(StringUtils.hasText(oldW.getStyleId()) ? oldW.getStyleId() : order.getStyleId());
        current.setStyleNo(StringUtils.hasText(oldW.getStyleNo()) ? oldW.getStyleNo() : order.getStyleNo());
        current.setWarehousingType(StringUtils.hasText(oldW.getWarehousingType()) ? oldW.getWarehousingType() : pw.getWarehousingType());
        current.setWarehouse(StringUtils.hasText(pw.getWarehouse()) ? pw.getWarehouse() : oldW.getWarehouse());
        current.setCuttingBundleId(StringUtils.hasText(pw.getCuttingBundleId()) ? pw.getCuttingBundleId() : oldW.getCuttingBundleId());
        current.setCuttingBundleNo(pw.getCuttingBundleNo() != null ? pw.getCuttingBundleNo() : oldW.getCuttingBundleNo());
        current.setCuttingBundleQrCode(StringUtils.hasText(pw.getCuttingBundleQrCode()) ? pw.getCuttingBundleQrCode() : oldW.getCuttingBundleQrCode());
        current.setQualifiedQuantity(qualified);
        current.setWarehousingQuantity(warehousingQty);
        current.setUnqualifiedQuantity(unqualified);
        current.setQualityStatus(computedQualityStatus);
        return current;
    }

    public ProductWarehousing buildManualRecordFromQualityScan(ProductWarehousing oldW, ProductWarehousing pw) {
        ProductWarehousing nr = new ProductWarehousing();
        nr.setOrderId(oldW.getOrderId());
        nr.setOrderNo(oldW.getOrderNo());
        nr.setStyleId(oldW.getStyleId());
        nr.setStyleNo(oldW.getStyleNo());
        nr.setStyleName(oldW.getStyleName());
        nr.setWarehousingType("manual");
        nr.setWarehouse(pw.getWarehouse());
        int qualifiedQty = oldW.getQualifiedQuantity() == null ? 0 : oldW.getQualifiedQuantity();
        nr.setWarehousingQuantity(qualifiedQty);
        nr.setQualifiedQuantity(qualifiedQty);
        nr.setUnqualifiedQuantity(0);
        nr.setQualityStatus(STATUS_QUALIFIED);
        nr.setCuttingBundleId(oldW.getCuttingBundleId());
        nr.setCuttingBundleNo(oldW.getCuttingBundleNo());
        nr.setCuttingBundleQrCode(oldW.getCuttingBundleQrCode());
        nr.setWarehousingOperatorId(pw.getWarehousingOperatorId());
        nr.setWarehousingOperatorName(pw.getWarehousingOperatorName());
        nr.setQualityOperatorId(oldW.getQualityOperatorId());
        nr.setQualityOperatorName(oldW.getQualityOperatorName());
        nr.setReceiverId(pw.getReceiverId());
        nr.setReceiverName(pw.getReceiverName());
        return nr;
    }

    public ProductWarehousing buildRepairReturnRecord(CuttingBundle bundle, ProductionOrder order,
            int qty, String rr, String operatorId, String operatorName, String warehouse,
            String warehousingNo, LocalDateTime now) {
        ProductWarehousing w = new ProductWarehousing();
        w.setOrderId(order.getId());
        w.setOrderNo(order.getOrderNo());
        w.setStyleId(order.getStyleId());
        w.setStyleNo(order.getStyleNo());
        w.setStyleName(order.getStyleName());
        w.setWarehousingNo(warehousingNo);
        w.setWarehousingType(WAREHOUSING_TYPE_REPAIR_RETURN);
        w.setWarehouse(warehouse);
        w.setWarehousingQuantity(0);
        w.setQualifiedQuantity(qty);
        w.setUnqualifiedQuantity(0);
        w.setQualityStatus(WAREHOUSING_TYPE_REPAIR_RETURN);
        w.setRepairRemark(rr);
        w.setCuttingBundleId(bundle.getId());
        w.setCuttingBundleNo(bundle.getBundleNo());
        w.setCuttingBundleQrCode(bundle.getQrCode());
        if (StringUtils.hasText(operatorId)) {
            w.setWarehousingOperatorId(operatorId);
            w.setReceiverId(operatorId);
        }
        if (StringUtils.hasText(operatorName)) {
            w.setWarehousingOperatorName(operatorName);
            w.setReceiverName(operatorName);
        }
        w.setWarehousingStartTime(now);
        w.setWarehousingEndTime(now);
        w.setCreateTime(now);
        w.setUpdateTime(now);
        w.setDeleteFlag(0);
        return w;
    }

    public void updateBundleAfterRepairDeclaration(String orderId, CuttingBundle bundle, LocalDateTime now) {
        int awaitingRepair = helper.repairDeclarationRemainingQtyByBundle(orderId, bundle.getId(), null);
        String nextStatus = awaitingRepair > 0 ? STATUS_UNQUALIFIED : STATUS_REPAIRED_WAITING_QC;
        try {
            cuttingBundleService.lambdaUpdate()
                    .eq(CuttingBundle::getId, bundle.getId())
                    .set(CuttingBundle::getStatus, nextStatus)
                    .set(CuttingBundle::getUpdateTime, now)
                    .update();
        } catch (Exception e) {
            log.warn("返修申报后更新菲号状态失败: bundleId={}, status={}", bundle.getId(), nextStatus, e);
        }
    }
}
