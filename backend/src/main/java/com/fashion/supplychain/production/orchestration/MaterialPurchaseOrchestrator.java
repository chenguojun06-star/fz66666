package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.orchestration.MaterialReconciliationOrchestrator;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class MaterialPurchaseOrchestrator {

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private MaterialReconciliationOrchestrator materialReconciliationOrchestrator;

    public IPage<MaterialPurchase> list(Map<String, Object> params) {
        return materialPurchaseService.queryPage(params);
    }

    public MaterialPurchase getById(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        MaterialPurchase purchase = materialPurchaseService.getById(key);
        if (purchase == null || (purchase.getDeleteFlag() != null && purchase.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("采购任务不存在");
        }
        return purchase;
    }

    public boolean save(MaterialPurchase materialPurchase) {
        if (materialPurchase == null) {
            throw new IllegalArgumentException("参数错误");
        }
        boolean ok = saveAndSync(materialPurchase);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        return true;
    }

    public boolean update(MaterialPurchase materialPurchase) {
        if (materialPurchase == null || !StringUtils.hasText(materialPurchase.getId())) {
            throw new IllegalArgumentException("参数错误");
        }
        MaterialPurchase current = materialPurchaseService.getById(materialPurchase.getId().trim());
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("采购任务不存在");
        }
        boolean ok = updateAndSync(materialPurchase);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        return true;
    }

    public boolean batch(List<MaterialPurchase> purchases) {
        if (purchases == null || purchases.isEmpty()) {
            throw new IllegalArgumentException("采购明细不能为空");
        }
        boolean ok = batchAndSync(purchases);
        if (!ok) {
            throw new IllegalStateException("批量保存失败");
        }
        return true;
    }

    public boolean updateArrivedQuantity(Map<String, Object> params) {
        String id = params == null ? null : (params.get("id") == null ? null : String.valueOf(params.get("id")));
        Integer arrivedQuantity = coerceInt(params == null ? null : params.get("arrivedQuantity"));
        String key = id == null ? null : StringUtils.trimWhitespace(id);
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        if (arrivedQuantity == null) {
            throw new IllegalArgumentException("arrivedQuantity参数错误");
        }
        if (arrivedQuantity < 0) {
            throw new IllegalArgumentException("arrivedQuantity不能小于0");
        }
        MaterialPurchase current = materialPurchaseService.getById(key);
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("采购任务不存在");
        }
        boolean ok = updateArrivedQuantityAndSync(key, arrivedQuantity);
        if (!ok) {
            throw new IllegalStateException("更新失败");
        }
        return true;
    }

    public Object previewDemand(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("orderId不能为空");
        }
        return materialPurchaseService.previewDemandByOrderId(orderId.trim());
    }

    public Object generateDemand(Map<String, Object> params) {
        String orderId = params == null ? null
                : (params.get("orderId") == null ? null : String.valueOf(params.get("orderId")));
        Object overwriteRaw = params == null ? null : params.get("overwrite");
        boolean overwriteFlag = overwriteRaw instanceof Boolean ? (Boolean) overwriteRaw
                : "true".equalsIgnoreCase(String.valueOf(overwriteRaw));

        String oid = null;
        if (orderId != null) {
            oid = orderId.trim();
        }

        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("orderId不能为空");
        }
        return materialPurchaseService.generateDemandByOrderId(oid, overwriteFlag);
    }

    public MaterialPurchase receive(Map<String, Object> body) {
        String purchaseId = body == null ? null
                : (body.get("purchaseId") == null ? null : String.valueOf(body.get("purchaseId")));
        String receiverId = body == null ? null
                : (body.get("receiverId") == null ? null : String.valueOf(body.get("receiverId")));
        String receiverName = body == null ? null
                : (body.get("receiverName") == null ? null : String.valueOf(body.get("receiverName")));

        if (!StringUtils.hasText(purchaseId)) {
            throw new IllegalArgumentException("参数错误");
        }

        MaterialPurchase purchase = materialPurchaseService.getById(purchaseId);
        if (purchase == null || (purchase.getDeleteFlag() != null && purchase.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("采购任务不存在");
        }

        String status = purchase.getStatus() == null ? "" : purchase.getStatus().trim();
        if ("completed".equals(status) || "cancelled".equals(status)) {
            throw new IllegalStateException("该采购任务已结束，无法领取");
        }

        boolean ok = receiveAndSync(purchaseId, receiverId, receiverName);
        if (!ok) {
            throw new IllegalStateException("领取失败");
        }

        MaterialPurchase updated = materialPurchaseService.getById(purchaseId);
        if (updated == null) {
            throw new IllegalStateException("领取失败");
        }
        if (updated.getUpdateTime() == null) {
            updated.setUpdateTime(LocalDateTime.now());
        }
        return updated;
    }

    public MaterialPurchase returnConfirm(Map<String, Object> body) {
        String purchaseId = body == null ? null
                : (body.get("purchaseId") == null ? null : String.valueOf(body.get("purchaseId")));
        String confirmerId = body == null ? null
                : (body.get("confirmerId") == null ? null : String.valueOf(body.get("confirmerId")));
        String confirmerName = body == null ? null
                : (body.get("confirmerName") == null ? null : String.valueOf(body.get("confirmerName")));
        Integer returnQuantity = coerceInt(body == null ? null : body.get("returnQuantity"));

        if (!StringUtils.hasText(purchaseId)) {
            throw new IllegalArgumentException("参数错误");
        }

        MaterialPurchase purchase = materialPurchaseService.getById(purchaseId);
        if (purchase == null || (purchase.getDeleteFlag() != null && purchase.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("采购任务不存在");
        }

        String status = purchase.getStatus() == null ? "" : purchase.getStatus().trim();
        if ("cancelled".equals(status)) {
            throw new IllegalStateException("该采购任务已取消，无法回料确认");
        }

        if (purchase.getReturnConfirmed() != null && purchase.getReturnConfirmed() == 1) {
            throw new IllegalStateException("该采购任务已回料确认，无法重复确认");
        }

        if (returnQuantity == null) {
            throw new IllegalArgumentException("请填写实际回料数量");
        }
        if (returnQuantity < 0) {
            throw new IllegalArgumentException("实际回料数量不能小于0");
        }
        int purchaseQty = purchase.getPurchaseQuantity() == null ? 0 : purchase.getPurchaseQuantity();
        int arrivedQty = purchase.getArrivedQuantity() == null ? 0 : purchase.getArrivedQuantity();
        int max = arrivedQty > 0 ? arrivedQty : purchaseQty;
        if (max >= 0 && returnQuantity > max) {
            throw new IllegalArgumentException("实际回料数量不能大于到货数量或采购数量");
        }

        boolean ok = returnConfirmAndSync(purchaseId, confirmerId, confirmerName, returnQuantity);
        if (!ok) {
            throw new IllegalStateException("回料确认失败");
        }

        MaterialPurchase updated = materialPurchaseService.getById(purchaseId);
        if (updated == null) {
            throw new IllegalStateException("回料确认失败");
        }
        if (updated.getUpdateTime() == null) {
            updated.setUpdateTime(LocalDateTime.now());
        }
        return updated;
    }

    public MaterialPurchase resetReturnConfirm(Map<String, Object> body) {
        String purchaseId = body == null ? null
                : (body.get("purchaseId") == null ? null : String.valueOf(body.get("purchaseId")));
        String reason = body == null ? null : (body.get("reason") == null ? null : String.valueOf(body.get("reason")));

        if (!StringUtils.hasText(purchaseId)) {
            throw new IllegalArgumentException("参数错误");
        }

        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("仅主管级别及以上可执行退回");
        }

        MaterialPurchase purchase = materialPurchaseService.getById(purchaseId);
        if (purchase == null || (purchase.getDeleteFlag() != null && purchase.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("采购任务不存在");
        }

        UserContext ctx = UserContext.get();
        String operatorId = ctx == null ? null : ctx.getUserId();
        String operatorName = ctx == null ? null : ctx.getUsername();

        boolean ok = materialPurchaseService.resetReturnConfirm(purchaseId, reason, operatorId, operatorName);
        if (!ok) {
            throw new IllegalStateException("退回处理失败");
        }

        try {
            materialReconciliationOrchestrator.upsertFromPurchaseId(purchaseId);
        } catch (Exception e) {
            log.warn("Failed to upsert material reconciliation after return confirm reset: purchaseId={}", purchaseId,
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

        try {
            MaterialPurchase current = materialPurchaseService.getById(purchaseId);
            if (current != null && StringUtils.hasText(current.getOrderId())) {
                ensureOrderStatusProduction(current.getOrderId());
                recomputeAndUpdateMaterialArrivalRate(current.getOrderId());
            }
        } catch (Exception e) {
            log.warn("Failed to sync order state after return confirm reset: purchaseId={}", purchaseId, e);
            scanRecordDomainService.insertOrchestrationFailure(
                    purchase.getOrderId(),
                    purchase.getOrderNo(),
                    purchase.getStyleId(),
                    purchase.getStyleNo(),
                    "syncOrderStateAfterReturnConfirmReset",
                    e == null ? "sync order state after return confirm reset failed"
                            : ("sync order state after return confirm reset failed: " + e.getMessage()),
                    LocalDateTime.now());
        }

        MaterialPurchase updated = materialPurchaseService.getById(purchaseId);
        if (updated == null) {
            throw new IllegalStateException("退回处理失败");
        }
        if (updated.getUpdateTime() == null) {
            updated.setUpdateTime(LocalDateTime.now());
        }
        return updated;
    }

    @Transactional(rollbackFor = Exception.class)
    private boolean saveAndSync(MaterialPurchase materialPurchase) {
        boolean ok = materialPurchaseService.savePurchaseAndUpdateOrder(materialPurchase);
        if (!ok) {
            return false;
        }
        syncAfterPurchaseChanged(materialPurchase);
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    private boolean updateAndSync(MaterialPurchase materialPurchase) {
        boolean ok = materialPurchaseService.updatePurchaseAndUpdateOrder(materialPurchase);
        if (!ok) {
            return false;
        }
        syncAfterPurchaseChanged(materialPurchase);
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    private boolean batchAndSync(List<MaterialPurchase> purchases) {
        boolean allOk = true;
        for (MaterialPurchase p : purchases) {
            if (p == null) {
                continue;
            }
            boolean ok = materialPurchaseService.savePurchaseAndUpdateOrder(p);
            if (!ok) {
                allOk = false;
                continue;
            }
            syncAfterPurchaseChanged(p);
        }
        return allOk;
    }

    @Transactional(rollbackFor = Exception.class)
    private boolean updateArrivedQuantityAndSync(String purchaseId, Integer arrivedQuantity) {
        boolean ok = materialPurchaseService.updateArrivedQuantity(purchaseId, arrivedQuantity);
        if (!ok) {
            return false;
        }
        MaterialPurchase updated = materialPurchaseService.getById(purchaseId);
        if (updated != null) {
            syncAfterPurchaseChanged(updated);
        }
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    private boolean receiveAndSync(String purchaseId, String receiverId, String receiverName) {
        boolean ok = materialPurchaseService.receivePurchase(purchaseId, receiverId, receiverName);
        if (!ok) {
            return false;
        }
        MaterialPurchase updated = materialPurchaseService.getById(purchaseId);
        if (updated != null) {
            syncAfterPurchaseChanged(updated);
        }
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    private boolean returnConfirmAndSync(String purchaseId, String confirmerId, String confirmerName,
            Integer returnQuantity) {
        boolean ok = materialPurchaseService.confirmReturnPurchase(purchaseId, confirmerId, confirmerName,
                returnQuantity);
        if (!ok) {
            return false;
        }
        MaterialPurchase updated = materialPurchaseService.getById(purchaseId);
        if (updated != null) {
            syncAfterPurchaseChanged(updated);
        }
        return true;
    }

    private void syncAfterPurchaseChanged(MaterialPurchase purchase) {
        if (purchase == null) {
            return;
        }

        if (StringUtils.hasText(purchase.getId())) {
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

        if (StringUtils.hasText(purchase.getOrderId())) {
            String oid = purchase.getOrderId().trim();
            ensureOrderStatusProduction(oid);
            recomputeAndUpdateMaterialArrivalRate(oid);
        }
    }

    private void ensureOrderStatusProduction(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            return;
        }
        String oid = orderId.trim();
        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || (order.getDeleteFlag() != null && order.getDeleteFlag() != 0)) {
            return;
        }
        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if ("completed".equalsIgnoreCase(st) || "production".equalsIgnoreCase(st)) {
            return;
        }
        ProductionOrder patch = new ProductionOrder();
        patch.setId(oid);
        patch.setStatus("production");
        patch.setUpdateTime(LocalDateTime.now());
        productionOrderService.updateById(patch);
    }

    private void recomputeAndUpdateMaterialArrivalRate(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            return;
        }
        String oid = orderId.trim();
        MaterialPurchaseService.ArrivalStats stats = materialPurchaseService.computeArrivalStatsByOrderId(oid);
        int rate = stats == null ? 0 : stats.getArrivalRate();
        productionOrderOrchestrator.updateMaterialArrivalRate(oid, rate);
    }

    public boolean delete(String id) {
        String key = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(key)) {
            throw new IllegalArgumentException("参数错误");
        }
        MaterialPurchase current = materialPurchaseService.getById(key);
        if (current == null || (current.getDeleteFlag() != null && current.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("采购任务不存在");
        }
        boolean ok = materialPurchaseService.deleteById(key);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }

        try {
            materialReconciliationOrchestrator.upsertFromPurchaseId(key);
        } catch (Exception e) {
            log.warn("Failed to upsert material reconciliation after purchase delete: purchaseId={}, orderId={}",
                    key,
                    current.getOrderId(),
                    e);
            scanRecordDomainService.insertOrchestrationFailure(
                    current.getOrderId(),
                    current.getOrderNo(),
                    current.getStyleId(),
                    current.getStyleNo(),
                    "upsertMaterialReconciliation",
                    e == null ? "upsertMaterialReconciliation failed"
                            : ("upsertMaterialReconciliation failed: " + e.getMessage()),
                    LocalDateTime.now());
        }

        if (StringUtils.hasText(current.getOrderId())) {
            recomputeAndUpdateMaterialArrivalRate(current.getOrderId().trim());
        }
        return true;
    }

    private Integer coerceInt(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number) {
            return ((Number) v).intValue();
        }
        String s = String.valueOf(v).trim();
        if (!StringUtils.hasText(s)) {
            return null;
        }
        try {
            return Integer.valueOf(s);
        } catch (Exception e) {
            return null;
        }
    }
}
