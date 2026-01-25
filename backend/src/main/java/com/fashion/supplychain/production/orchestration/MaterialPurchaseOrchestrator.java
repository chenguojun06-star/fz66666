package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.orchestration.MaterialReconciliationOrchestrator;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.stream.Collectors;
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
        String remark = params == null ? null
                : (params.get("remark") == null ? null : String.valueOf(params.get("remark")));
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
        int purchaseQty = current.getPurchaseQuantity() == null ? 0 : current.getPurchaseQuantity();
        if (purchaseQty > 0 && arrivedQuantity * 100 < purchaseQty * 70) {
            if (!StringUtils.hasText(remark)) {
                throw new IllegalArgumentException("到货不足70%，请填写备注");
            }
        }
        boolean ok = updateArrivedQuantityAndSync(key, arrivedQuantity, remark);
        if (!ok) {
            throw new IllegalStateException("更新失败");
        }
        return true;
    }

    public Object previewDemand(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            throw new IllegalArgumentException("orderId不能为空");
        }

        String seedOrderId = orderId.trim();
        ProductionOrder seed = productionOrderService.getDetailById(seedOrderId);
        if (seed == null) {
            throw new NoSuchElementException("生产订单不存在");
        }

        List<String> orderIds = resolveTargetOrderIds(seed, false);
        return buildBatchPreview(orderIds);
    }

    public Object generateDemand(Map<String, Object> params) {
        String orderId = params == null ? null
                : (params.get("orderId") == null ? null : String.valueOf(params.get("orderId")));
        Object orderIdsRaw = params == null ? null : params.get("orderIds");
        Object overwriteRaw = params == null ? null : params.get("overwrite");
        boolean overwriteFlag = overwriteRaw instanceof Boolean b ? b
                : "true".equalsIgnoreCase(String.valueOf(overwriteRaw));

        String oid = null;
        if (orderId != null) {
            oid = orderId.trim();
        }

        List<String> explicitOrderIds = coerceStringList(orderIdsRaw);

        List<String> targetOrderIds;

        if (explicitOrderIds != null && !explicitOrderIds.isEmpty()) {
            targetOrderIds = new ArrayList<>();
            for (String x : explicitOrderIds) {
                String id = StringUtils.hasText(x) ? x.trim() : null;
                if (!StringUtils.hasText(id)) {
                    continue;
                }
                if (!overwriteFlag && materialPurchaseService.existsActivePurchaseForOrder(id)) {
                    continue;
                }
                targetOrderIds.add(id);
            }
        } else {
            if (!StringUtils.hasText(oid)) {
                throw new IllegalArgumentException("orderId不能为空");
            }
            ProductionOrder seed = productionOrderService.getDetailById(oid);
            if (seed == null) {
                throw new NoSuchElementException("生产订单不存在");
            }
            if (!overwriteFlag && materialPurchaseService.existsActivePurchaseForOrder(oid)) {
                throw new IllegalStateException("该订单已生成采购需求");
            }
            targetOrderIds = resolveTargetOrderIds(seed, overwriteFlag);
        }

        return generateBatchDemand(targetOrderIds, overwriteFlag);
    }

    private List<String> resolveTargetOrderIds(ProductionOrder seed, boolean overwrite) {
        List<ProductionOrder> matchedOrders = resolveSameDaySameStyleOrders(seed);

        List<String> out = new ArrayList<>();
        for (ProductionOrder o : matchedOrders) {
            if (o == null || !StringUtils.hasText(o.getId())) {
                continue;
            }
            String oid = o.getId().trim();
            if (!StringUtils.hasText(oid)) {
                continue;
            }
            if (!overwrite && materialPurchaseService.existsActivePurchaseForOrder(oid)) {
                continue;
            }
            out.add(oid);
        }
        return out;
    }

    private List<MaterialPurchase> buildBatchPreview(List<String> orderIds) {
        List<MaterialPurchase> out = new ArrayList<>();
        if (orderIds == null || orderIds.isEmpty()) {
            return out;
        }

        LinkedHashMap<String, String> purchaseNoByKey = new LinkedHashMap<>();
        for (String idRaw : orderIds) {
            String id = StringUtils.hasText(idRaw) ? idRaw.trim() : null;
            if (!StringUtils.hasText(id)) {
                continue;
            }
            List<MaterialPurchase> items = materialPurchaseService.previewDemandByOrderId(id);
            if (items == null || items.isEmpty()) {
                continue;
            }
            for (MaterialPurchase p : items) {
                if (p == null) {
                    continue;
                }
                String key = mergeKey(p);
                String shared = purchaseNoByKey.get(key);
                if (!StringUtils.hasText(shared)) {
                    shared = p.getPurchaseNo();
                    if (StringUtils.hasText(shared)) {
                        purchaseNoByKey.put(key, shared);
                    }
                } else {
                    p.setPurchaseNo(shared);
                }
                out.add(p);
            }
        }

        return out;
    }

    private List<MaterialPurchase> generateBatchDemand(List<String> orderIds, boolean overwrite) {
        List<MaterialPurchase> out = new ArrayList<>();
        if (orderIds == null || orderIds.isEmpty()) {
            return out;
        }

        if (overwrite) {
            LocalDateTime now = LocalDateTime.now();
            for (String idRaw : orderIds) {
                String oid = StringUtils.hasText(idRaw) ? idRaw.trim() : null;
                if (!StringUtils.hasText(oid)) {
                    continue;
                }
                MaterialPurchase patch = new MaterialPurchase();
                patch.setDeleteFlag(1);
                patch.setUpdateTime(now);
                materialPurchaseService.update(patch, new LambdaQueryWrapper<MaterialPurchase>()
                        .eq(MaterialPurchase::getOrderId, oid)
                        .eq(MaterialPurchase::getDeleteFlag, 0));
            }
        }

        LinkedHashMap<String, String> purchaseNoByKey = new LinkedHashMap<>();

        for (String idRaw : orderIds) {
            String oid = StringUtils.hasText(idRaw) ? idRaw.trim() : null;
            if (!StringUtils.hasText(oid)) {
                continue;
            }
            List<MaterialPurchase> items = materialPurchaseService.previewDemandByOrderId(oid);
            if (items == null || items.isEmpty()) {
                continue;
            }

            for (MaterialPurchase p : items) {
                if (p == null) {
                    continue;
                }

                String key = mergeKey(p);
                String shared = purchaseNoByKey.get(key);
                if (!StringUtils.hasText(shared)) {
                    shared = p.getPurchaseNo();
                    if (StringUtils.hasText(shared)) {
                        purchaseNoByKey.put(key, shared);
                    }
                } else {
                    p.setPurchaseNo(shared);
                }

                boolean ok = materialPurchaseService.savePurchaseAndUpdateOrder(p);
                if (ok) {
                    out.add(p);
                }
            }
        }

        return out;
    }

    private List<ProductionOrder> resolveSameDaySameStyleOrders(ProductionOrder seed) {
        if (seed == null || !StringUtils.hasText(seed.getId())) {
            return List.of();
        }

        String seedId = seed.getId().trim();
        String styleId = StringUtils.hasText(seed.getStyleId()) ? seed.getStyleId().trim() : null;
        LocalDateTime createTime = seed.getCreateTime();
        if (!StringUtils.hasText(styleId) || createTime == null) {
            return List.of(seed);
        }

        LocalDate day = createTime.toLocalDate();
        LocalDateTime start = day.atStartOfDay();
        LocalDateTime nextStart = day.plusDays(1).atStartOfDay();

        List<ProductionOrder> list = productionOrderService.list(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getStyleId, styleId)
                .ge(ProductionOrder::getCreateTime, start)
                .lt(ProductionOrder::getCreateTime, nextStart)
                .orderByAsc(ProductionOrder::getCreateTime)
                .orderByAsc(ProductionOrder::getOrderNo));

        if (list == null || list.isEmpty()) {
            return List.of(seed);
        }

        LinkedHashMap<String, ProductionOrder> dedup = new LinkedHashMap<>();
        for (ProductionOrder o : list) {
            if (o == null || !StringUtils.hasText(o.getId())) {
                continue;
            }
            String id = o.getId().trim();
            if (!StringUtils.hasText(id)) {
                continue;
            }
            dedup.put(id, o);
        }

        if (!dedup.containsKey(seedId)) {
            dedup.put(seedId, seed);
        }
        return new ArrayList<>(dedup.values());
    }

    private String mergeKey(MaterialPurchase p) {
        return String.join("|",
                safe(p == null ? null : p.getMaterialType()),
                safe(p == null ? null : p.getMaterialCode()),
                safe(p == null ? null : p.getMaterialName()),
                safe(p == null ? null : p.getSpecifications()),
                safe(p == null ? null : p.getUnit()),
                safe(p == null ? null : p.getSupplierName()));
    }

    private String safe(String v) {
        return v == null ? "" : v.trim();
    }

    private List<String> coerceStringList(Object raw) {
        if (raw == null) {
            return List.of();
        }
        if (raw instanceof List<?> list) {
            List<String> out = new ArrayList<>();
            for (Object o : list) {
                if (o == null) {
                    continue;
                }
                String s = String.valueOf(o);
                if (StringUtils.hasText(s)) {
                    out.add(s.trim());
                }
            }
            return out;
        }
        String s = String.valueOf(raw);
        if (!StringUtils.hasText(s)) {
            return List.of();
        }
        String[] parts = s.split("[,，\\s]+");
        List<String> out = new ArrayList<>();
        for (String p : parts) {
            if (StringUtils.hasText(p)) {
                out.add(p.trim());
            }
        }
        return out;
    }

    public MaterialPurchase receive(Map<String, Object> body) {
        String purchaseId = body == null ? null
                : (body.get("purchaseId") == null ? null : String.valueOf(body.get("purchaseId")));
        String receiverIdValue = body == null ? null
                : (body.get("receiverId") == null ? null : String.valueOf(body.get("receiverId")));
        String receiverNameValue = body == null ? null
                : (body.get("receiverName") == null ? null : String.valueOf(body.get("receiverName")));

        if (!StringUtils.hasText(purchaseId)) {
            throw new IllegalArgumentException("参数错误");
        }
        if (!StringUtils.hasText(receiverIdValue) && !StringUtils.hasText(receiverNameValue)) {
            throw new IllegalArgumentException("领取人ID或姓名不能为空");
        }

        MaterialPurchase purchase = materialPurchaseService.getById(purchaseId);
        if (purchase == null || (purchase.getDeleteFlag() != null && purchase.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("采购任务不存在");
        }

        String status = purchase.getStatus() == null ? "" : purchase.getStatus().trim();
        if ("completed".equals(status) || "cancelled".equals(status)) {
            throw new IllegalStateException("该采购任务已结束，无法领取");
        }

        // 检查是否已被领取
        String existingReceiverId = purchase.getReceiverId() == null ? "" : purchase.getReceiverId().trim();
        String existingReceiverName = purchase.getReceiverName() == null ? "" : purchase.getReceiverName().trim();
        String rid = safe(receiverIdValue);
        String rname = safe(receiverNameValue);
        
        boolean alreadyReceived = !"pending".equals(status) && StringUtils.hasText(status);
        if (alreadyReceived) {
            // 检查是否是同一个人
            boolean isSame = false;
            if (!rid.isEmpty() && !existingReceiverId.isEmpty()) {
                isSame = Objects.equals(rid, existingReceiverId);
            } else if (!rname.isEmpty() && !existingReceiverName.isEmpty()) {
                isSame = Objects.equals(rname, existingReceiverName);
            }
            if (!isSame) {
                String otherName = StringUtils.hasText(existingReceiverName) ? existingReceiverName : "他人";
                throw new IllegalStateException("该任务已被「" + otherName + "」领取，无法重复领取");
            }
        }

        boolean ok = receiveAndSync(
                purchaseId,
                StringUtils.hasText(rid) ? rid : null,
                StringUtils.hasText(rname) ? rname : null
        );
        if (!ok) {
            // 再次检查最新状态
            MaterialPurchase latest = materialPurchaseService.getById(purchaseId);
            if (latest != null) {
                String latestReceiverName = safe(latest.getReceiverName());
                String latestReceiverId = safe(latest.getReceiverId());
                boolean isSameNow = false;
                if (!rid.isEmpty() && !latestReceiverId.isEmpty()) {
                    isSameNow = Objects.equals(rid, latestReceiverId);
                } else if (!rname.isEmpty() && !latestReceiverName.isEmpty()) {
                    isSameNow = Objects.equals(rname, latestReceiverName);
                }
                if (!isSameNow && !latestReceiverName.isEmpty()) {
                    throw new IllegalStateException("该任务已被「" + latestReceiverName + "」领取，无法重复领取");
                }
            }
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
        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("退回原因不能为空");
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
    private boolean updateArrivedQuantityAndSync(String purchaseId, Integer arrivedQuantity, String remark) {
        boolean ok = materialPurchaseService.updateArrivedQuantity(purchaseId, arrivedQuantity, remark);
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

        boolean allowReconciliation = !StringUtils.hasText(purchase.getOrderId())
                && !StringUtils.hasText(purchase.getOrderNo());
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

    /**
     * 通过扫码获取关联的采购单列表
     * @param params 包含 scanCode 和 orderNo 
     * @return 采购单列表
     */
    public List<MaterialPurchase> getByScanCode(Map<String, Object> params) {
        String scanCode = params.get("scanCode") != null ? String.valueOf(params.get("scanCode")).trim() : null;
        String orderNo = params.get("orderNo") != null ? String.valueOf(params.get("orderNo")).trim() : null;

        // 如果有 scanCode，尝试多种方式匹配
        if (StringUtils.hasText(scanCode)) {
            // 1. 先尝试作为采购单号精确查询
            LambdaQueryWrapper<MaterialPurchase> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(MaterialPurchase::getPurchaseNo, scanCode);
            wrapper.eq(MaterialPurchase::getDeleteFlag, 0);
            List<MaterialPurchase> purchases = materialPurchaseService.list(wrapper);
            
            if (purchases != null && !purchases.isEmpty()) {
                return purchases;
            }

            // 2. 尝试将 scanCode 转换为订单号格式
            // P020226012201 -> PO20260122001
            String normalizedOrderNo = normalizeOrderNo(scanCode);
            if (StringUtils.hasText(normalizedOrderNo)) {
                wrapper = new LambdaQueryWrapper<>();
                wrapper.eq(MaterialPurchase::getOrderNo, normalizedOrderNo);
                wrapper.eq(MaterialPurchase::getDeleteFlag, 0);
                wrapper.orderByDesc(MaterialPurchase::getCreateTime);
                purchases = materialPurchaseService.list(wrapper);
                
                if (purchases != null && !purchases.isEmpty()) {
                    return purchases;
                }
            }
        }

        // 如果有明确的订单号参数，用它查询
        if (StringUtils.hasText(orderNo)) {
            LambdaQueryWrapper<MaterialPurchase> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(MaterialPurchase::getOrderNo, orderNo);
            wrapper.eq(MaterialPurchase::getDeleteFlag, 0);
            wrapper.orderByDesc(MaterialPurchase::getCreateTime);
            List<MaterialPurchase> purchases = materialPurchaseService.list(wrapper);
            
            if (purchases != null && !purchases.isEmpty()) {
                return purchases;
            }
        }

        return new ArrayList<>();
    }

    /**
     * 将各种格式的订单号标准化为 PO 格式
     * 例如: P020226012201 -> PO20260122001 (将 P0 替换为 PO)
     */
    private String normalizeOrderNo(String code) {
        if (!StringUtils.hasText(code)) {
            return null;
        }
        
        String trimmed = code.trim();
        
        // 如果已经是 PO 开头，直接返回
        if (trimmed.startsWith("PO")) {
            return trimmed;
        }
        
        // P0 开头的转换为 PO
        if (trimmed.startsWith("P0")) {
            return "PO" + trimmed.substring(2);
        }
        
        return null;
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

    public List<MaterialPurchase> getMyTasks() {
        UserContext ctx = UserContext.get();
        String userId = ctx == null ? null : ctx.getUserId();
        if (!StringUtils.hasText(userId)) {
            return new ArrayList<>();
        }
        
        List<MaterialPurchase> allPurchases = materialPurchaseService.list();
        return allPurchases.stream()
                .filter(p -> p.getDeleteFlag() == null || p.getDeleteFlag() == 0)
                .filter(p -> "received".equals(p.getStatus()))
                .filter(p -> p.getReturnConfirmed() == null || p.getReturnConfirmed() == 0)
                .filter(p -> Objects.equals(p.getReceiverId(), userId))
                .collect(Collectors.toList());
    }

    private Integer coerceInt(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number number) {
            return number.intValue();
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
