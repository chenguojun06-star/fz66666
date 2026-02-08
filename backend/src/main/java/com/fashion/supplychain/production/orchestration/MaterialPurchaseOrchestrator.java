package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.orchestration.MaterialReconciliationOrchestrator;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Set;
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

    @Autowired
    private MaterialPurchaseOrchestratorHelper helper;

    public IPage<MaterialPurchase> list(Map<String, Object> params) {
        return materialPurchaseService.queryPage(params);
    }

    /**
     * 列表查询并补充下单数量字段（从订单或样板生产获取）
     */
    public Map<String, Object> listWithEnrichment(Map<String, Object> params) {
        return helper.listWithEnrichment(params);
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
        Integer arrivedQuantity = helper.coerceInt(params == null ? null : params.get("arrivedQuantity"));
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
        if (purchaseQty > 0 && arrivedQuantity * 100 < purchaseQty * MaterialConstants.ARRIVAL_RATE_THRESHOLD_REMARK) {
            if (!StringUtils.hasText(remark)) {
                throw new IllegalArgumentException(
                        "到货不足" + MaterialConstants.ARRIVAL_RATE_THRESHOLD_REMARK + "%，请填写备注");
            }
        }
        boolean ok = updateArrivedQuantityAndSync(key, arrivedQuantity, remark);
        if (!ok) {
            throw new IllegalStateException("更新失败");
        }
        return true;
    }

    public MaterialPurchase createInstruction(Map<String, Object> params) {
        Map<String, Object> safeParams = params == null ? new java.util.LinkedHashMap<>() : params;
        String materialId = ParamUtils.toTrimmedString(safeParams.get("materialId"));
        String materialCode = ParamUtils.toTrimmedString(safeParams.get("materialCode"));
        String materialName = ParamUtils.toTrimmedString(safeParams.get("materialName"));
        String materialType = ParamUtils.toTrimmedString(safeParams.get("materialType"));
        String specifications = ParamUtils.toTrimmedString(safeParams.get("specifications"));
        String unit = ParamUtils.toTrimmedString(safeParams.get("unit"));
        String color = ParamUtils.toTrimmedString(safeParams.get("color"));
        String size = ParamUtils.toTrimmedString(safeParams.get("size"));
        String receiverId = ParamUtils.toTrimmedString(safeParams.get("receiverId"));
        String receiverName = ParamUtils.toTrimmedString(safeParams.get("receiverName"));
        String remark = ParamUtils.toTrimmedString(safeParams.get("remark"));
        Integer qty = helper.coerceInt(safeParams.get("purchaseQuantity"));

        if (!StringUtils.hasText(materialCode) && !StringUtils.hasText(materialName)) {
            throw new IllegalArgumentException("物料信息不能为空");
        }
        if (qty == null || qty <= 0) {
            throw new IllegalArgumentException("采购数量必须大于0");
        }
        if (!StringUtils.hasText(receiverId) || !StringUtils.hasText(receiverName)) {
            throw new IllegalArgumentException("请指定采购人");
        }

        MaterialPurchase purchase = new MaterialPurchase();
        purchase.setMaterialId(materialId);
        purchase.setMaterialCode(materialCode);
        purchase.setMaterialName(materialName);
        purchase.setMaterialType(materialType);
        purchase.setSpecifications(specifications);
        purchase.setUnit(unit);
        purchase.setColor(color);
        purchase.setSize(size);
        purchase.setPurchaseQuantity(qty);
        purchase.setArrivedQuantity(0);
        purchase.setStatus(MaterialConstants.STATUS_RECEIVED);
        purchase.setReceiverId(receiverId);
        purchase.setReceiverName(receiverName);
        purchase.setReceivedTime(LocalDateTime.now());
        purchase.setRemark(remark);
        purchase.setSourceType("stock");

        boolean ok = saveAndSync(purchase);
        if (!ok) {
            throw new IllegalStateException("创建采购指令失败");
        }
        return materialPurchaseService.getById(purchase.getId());
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

        List<String> orderIds = helper.resolveTargetOrderIds(seed, false);
        return helper.buildBatchPreview(orderIds);
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

        List<String> explicitOrderIds = helper.coerceStringList(orderIdsRaw);

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
            targetOrderIds = helper.resolveTargetOrderIds(seed, overwriteFlag);
        }

        return helper.generateBatchDemand(targetOrderIds, overwriteFlag);
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
        String normalizedStatus = status.toLowerCase();
        if (MaterialConstants.STATUS_COMPLETED.equals(normalizedStatus) || MaterialConstants.STATUS_CANCELLED.equals(normalizedStatus)) {
            throw new IllegalStateException("该采购任务已结束，无法领取");
        }

        // 检查是否已被领取
        String existingReceiverId = purchase.getReceiverId() == null ? "" : purchase.getReceiverId().trim();
        String existingReceiverName = purchase.getReceiverName() == null ? "" : purchase.getReceiverName().trim();
        String rid = helper.safe(receiverIdValue);
        String rname = helper.safe(receiverNameValue);

        boolean alreadyReceived = !MaterialConstants.STATUS_PENDING.equals(normalizedStatus) && StringUtils.hasText(normalizedStatus);
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
                StringUtils.hasText(rname) ? rname : null);
        if (!ok) {
            // 再次检查最新状态
            MaterialPurchase latest = materialPurchaseService.getById(purchaseId);
            if (latest != null) {
                String latestReceiverName = helper.safe(latest.getReceiverName());
                String latestReceiverId = helper.safe(latest.getReceiverId());
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
        Integer returnQuantity = helper.coerceInt(body == null ? null : body.get("returnQuantity"));

        if (!StringUtils.hasText(purchaseId)) {
            throw new IllegalArgumentException("参数错误");
        }

        MaterialPurchase purchase = materialPurchaseService.getById(purchaseId);
        if (purchase == null || (purchase.getDeleteFlag() != null && purchase.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("采购任务不存在");
        }

        String status = purchase.getStatus() == null ? "" : purchase.getStatus().trim();
        if (MaterialConstants.STATUS_CANCELLED.equals(status)) {
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
                helper.ensureOrderStatusProduction(current.getOrderId());
                helper.recomputeAndUpdateMaterialArrivalRate(current.getOrderId(), productionOrderOrchestrator);
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
        // 如果单价为0或null，尝试从BOM填充单价
        helper.fillUnitPriceFromBom(materialPurchase);

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
            helper.ensureOrderStatusProduction(oid);
            helper.recomputeAndUpdateMaterialArrivalRate(oid, productionOrderOrchestrator);
        }
    }

    /**
     * 通过扫码获取关联的采购单列表
     *
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
            String normalizedOrderNo = helper.normalizeOrderNo(scanCode);
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
            helper.recomputeAndUpdateMaterialArrivalRate(current.getOrderId().trim(), productionOrderOrchestrator);
        }
        return true;
    }

    public List<MaterialPurchase> getMyTasks() {
        UserContext ctx = UserContext.get();
        String userId = ctx == null ? null : ctx.getUserId();
        if (!StringUtils.hasText(userId)) {
            return new ArrayList<>();
        }

        List<MaterialPurchase> myPurchases = materialPurchaseService.list()
                .stream()
                .filter(p -> p.getDeleteFlag() == null || p.getDeleteFlag() == 0)
                .filter(p -> {
                    String status = p.getStatus();
                    if (status == null) return false;
                    String normalizedStatus = status.toLowerCase();
                    return MaterialConstants.STATUS_RECEIVED.equals(normalizedStatus);
                })
                .filter(p -> p.getReturnConfirmed() == null || p.getReturnConfirmed() == 0)
                .filter(p -> Objects.equals(p.getReceiverId(), userId))
                .collect(Collectors.toList());

        // 过滤掉已关闭/已完成订单对应的采购任务
        if (myPurchases.isEmpty()) {
            return myPurchases;
        }

        Set<String> orderIds = myPurchases.stream()
                .map(MaterialPurchase::getOrderId)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());

        if (orderIds.isEmpty()) {
            return myPurchases;
        }

        // 查询有效订单（排除已关闭/已完成/已取消/已归档）
        Set<String> validOrderIds = productionOrderService.lambdaQuery()
                .in(ProductionOrder::getId, orderIds)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived")
                .list()
                .stream()
                .map(ProductionOrder::getId)
                .collect(Collectors.toSet());

        // 只返回有效订单的采购任务
        return myPurchases.stream()
                .filter(purchase -> validOrderIds.contains(purchase.getOrderId()))
                .collect(Collectors.toList());
    }

}
