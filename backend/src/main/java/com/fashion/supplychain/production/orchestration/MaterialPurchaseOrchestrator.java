package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.orchestration.MaterialReconciliationOrchestrator;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private MaterialPickingService materialPickingService;

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

        if (explicitOrderIds != null && !explicitOrderIds.isEmpty()) {
            // 按订单创建日期分组，同一天的订单内部合并
            // 不同天单独处理，彻底防止跨天相同面辅料被归入同一采购单
            LinkedHashMap<LocalDate, List<String>> orderIdsByDate = new LinkedHashMap<>();
            for (String x : explicitOrderIds) {
                String id = StringUtils.hasText(x) ? x.trim() : null;
                if (!StringUtils.hasText(id)) continue;
                if (!overwriteFlag && materialPurchaseService.existsActivePurchaseForOrder(id)) continue;
                ProductionOrder o = productionOrderService.getDetailById(id);
                if (o == null) continue;
                LocalDate day = (o.getCreateTime() != null) ? o.getCreateTime().toLocalDate() : LocalDate.now();
                orderIdsByDate.computeIfAbsent(day, k -> new ArrayList<>()).add(id);
            }
            List<Object> allGenerated = new ArrayList<>();
            for (List<String> dateGroup : orderIdsByDate.values()) {
                allGenerated.addAll(helper.generateBatchDemand(dateGroup, overwriteFlag));
            }
            return allGenerated;
        }

        // 单订单路径：通过 seed 订单日期查找同天同款订单批量生成
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
        List<String> targetOrderIds = helper.resolveTargetOrderIds(seed, overwriteFlag);
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

    /**
     * 检查当天是否有同款面辅料的可合并采购任务
     * 用于领取前提示用户是否一起领取
     */
    public Map<String, Object> checkMergeable(String purchaseId) {
        return helper.checkMergeableForReceive(purchaseId);
    }

    /**
     * 批量领取采购任务（合并采购一键领取）
     * @param body 包含 purchaseIds(数组), receiverId, receiverName
     * @return 领取结果
     */
    public Map<String, Object> batchReceive(Map<String, Object> body) {
        List<String> purchaseIds = helper.coerceStringList(body == null ? null : body.get("purchaseIds"));
        String receiverId = body == null ? null
                : (body.get("receiverId") == null ? null : String.valueOf(body.get("receiverId")));
        String receiverName = body == null ? null
                : (body.get("receiverName") == null ? null : String.valueOf(body.get("receiverName")));

        if (purchaseIds.isEmpty()) {
            throw new IllegalArgumentException("采购任务ID列表不能为空");
        }
        if (!StringUtils.hasText(receiverId) && !StringUtils.hasText(receiverName)) {
            throw new IllegalArgumentException("领取人ID或姓名不能为空");
        }

        String rid = helper.safe(receiverId);
        String rname = helper.safe(receiverName);

        int successCount = 0;
        int skipCount = 0;
        List<String> failMessages = new ArrayList<>();

        for (String idRaw : purchaseIds) {
            String pid = StringUtils.hasText(idRaw) ? idRaw.trim() : null;
            if (!StringUtils.hasText(pid)) continue;

            try {
                MaterialPurchase purchase = materialPurchaseService.getById(pid);
                if (purchase == null || (purchase.getDeleteFlag() != null && purchase.getDeleteFlag() != 0)) {
                    skipCount++;
                    continue;
                }

                String st = purchase.getStatus() == null ? "" : purchase.getStatus().trim().toLowerCase();
                if (MaterialConstants.STATUS_COMPLETED.equals(st) || MaterialConstants.STATUS_CANCELLED.equals(st)) {
                    skipCount++;
                    continue;
                }

                // 如果已被他人领取，跳过
                if (!MaterialConstants.STATUS_PENDING.equals(st) && StringUtils.hasText(st)) {
                    String existingRid = helper.safe(purchase.getReceiverId());
                    String existingRname = helper.safe(purchase.getReceiverName());
                    boolean isSame = false;
                    if (!rid.isEmpty() && !existingRid.isEmpty()) {
                        isSame = Objects.equals(rid, existingRid);
                    } else if (!rname.isEmpty() && !existingRname.isEmpty()) {
                        isSame = Objects.equals(rname, existingRname);
                    }
                    if (!isSame) {
                        skipCount++;
                        continue;
                    }
                }

                boolean ok = receiveAndSync(
                        pid,
                        StringUtils.hasText(rid) ? rid : null,
                        StringUtils.hasText(rname) ? rname : null);
                if (ok) {
                    successCount++;
                } else {
                    failMessages.add("采购单 " + (purchase.getPurchaseNo() != null ? purchase.getPurchaseNo() : pid) + " 领取失败");
                }
            } catch (Exception e) {
                failMessages.add("采购单 " + pid + ": " + (e.getMessage() != null ? e.getMessage() : "领取失败"));
            }
        }

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("successCount", successCount);
        result.put("skipCount", skipCount);
        result.put("failCount", failMessages.size());
        result.put("failMessages", failMessages);
        result.put("totalRequested", purchaseIds.size());
        return result;
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

        // 自动设置来源类型：无订单关联且未指定来源时，标记为批量采购
        if (!StringUtils.hasText(materialPurchase.getSourceType())
                && !StringUtils.hasText(materialPurchase.getOrderId())
                && !StringUtils.hasText(materialPurchase.getOrderNo())) {
            materialPurchase.setSourceType("batch");
        }

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
            // 自动回料确认：更新到货数量时同步标记为已回料，避免PC端再次手动确认
            if (arrivedQuantity != null && arrivedQuantity > 0
                    && (updated.getReturnConfirmed() == null || updated.getReturnConfirmed() != 1)) {
                UserContext ctx = UserContext.get();
                String confirmerId = ctx != null ? ctx.getUserId() : null;
                String confirmerName = ctx != null ? ctx.getUsername() : null;
                if (confirmerName == null || confirmerName.trim().isEmpty()) {
                    confirmerName = "系统自动";
                }
                materialPurchaseService.confirmReturnPurchase(
                        purchaseId, confirmerId, confirmerName.trim(), arrivedQuantity);
                // 重新获取最新状态
                updated = materialPurchaseService.getById(purchaseId);
            }
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
                // 排除已完成的任务（已入库数量 >= 采购数量）
                .filter(p -> {
                    if (p.getArrivedQuantity() == null) return true;
                    if (p.getPurchaseQuantity() == null) return true;
                    return p.getArrivedQuantity() < p.getPurchaseQuantity();
                })
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
        List<ProductionOrder> validOrders = productionOrderService.lambdaQuery()
                .in(ProductionOrder::getId, orderIds)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived")
                .list();

        // 构建 orderId -> orderNo 映射
        Map<String, String> orderIdToOrderNoMap = validOrders.stream()
                .collect(Collectors.toMap(
                        ProductionOrder::getId,
                        ProductionOrder::getOrderNo,
                        (v1, v2) -> v1
                ));

        Set<String> validOrderIds = orderIdToOrderNoMap.keySet();

        // 返回采购任务：
        // 1. 无订单关联的独立采购任务（orderId 为空）
        // 2. 有订单关联且订单有效的采购任务
        return myPurchases.stream()
                .filter(purchase -> {
                    String orderId = purchase.getOrderId();
                    // 如果没有关联订单，保留（独立采购）
                    if (!StringUtils.hasText(orderId)) {
                        return true;
                    }
                    // 如果有关联订单，检查订单是否有效
                    return validOrderIds.contains(orderId);
                })
                .peek(purchase -> {
                    // 如果 orderNo 为空，从映射表中补充
                    if (!StringUtils.hasText(purchase.getOrderNo())) {
                        String orderId = purchase.getOrderId();
                        if (StringUtils.hasText(orderId)) {
                            String orderNo = orderIdToOrderNoMap.get(orderId);
                            if (orderNo != null) {
                                purchase.setOrderNo(orderNo);
                            }
                        }
                    }
                })
                .collect(Collectors.toList());
    }

    /**
     * 获取采购任务状态统计（全局，不受分页影响）
     * 支持按 materialType / sourceType / orderNo(keyword) 筛选
     */
    public Map<String, Object> getStatusStats(Map<String, Object> params) {
        // 复用 queryPage 的筛选逻辑，但不分页
        LambdaQueryWrapper<MaterialPurchase> wrapper = new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getDeleteFlag, 0);

        String orderNo = params == null ? "" : String.valueOf(params.getOrDefault("orderNo", "")).trim();
        String materialType = params == null ? "" : String.valueOf(params.getOrDefault("materialType", "")).trim();
        String sourceType = params == null ? "" : String.valueOf(params.getOrDefault("sourceType", "")).trim();

        if (StringUtils.hasText(orderNo)) {
            wrapper.and(w -> w
                .like(MaterialPurchase::getOrderNo, orderNo)
                .or().like(MaterialPurchase::getPurchaseNo, orderNo)
                .or().like(MaterialPurchase::getMaterialCode, orderNo)
                .or().like(MaterialPurchase::getMaterialName, orderNo)
            );
        }
        if (StringUtils.hasText(sourceType)) {
            if ("batch".equals(sourceType)) {
                wrapper.in(MaterialPurchase::getSourceType, "batch", "stock", "manual");
            } else {
                wrapper.eq(MaterialPurchase::getSourceType, sourceType);
            }
        }
        if (StringUtils.hasText(materialType)) {
            String mt = materialType;
            if (MaterialConstants.TYPE_FABRIC.equals(mt) || MaterialConstants.TYPE_LINING.equals(mt)
                    || MaterialConstants.TYPE_ACCESSORY.equals(mt)) {
                wrapper.and(w -> {
                    w.likeRight(MaterialPurchase::getMaterialType, mt);
                    if (MaterialConstants.TYPE_FABRIC.equals(mt)) {
                        w.or().likeRight(MaterialPurchase::getMaterialType, MaterialConstants.TYPE_FABRIC_CN);
                    } else if (MaterialConstants.TYPE_LINING.equals(mt)) {
                        w.or().likeRight(MaterialPurchase::getMaterialType, MaterialConstants.TYPE_LINING_CN);
                    } else if (MaterialConstants.TYPE_ACCESSORY.equals(mt)) {
                        w.or().likeRight(MaterialPurchase::getMaterialType, MaterialConstants.TYPE_ACCESSORY_CN);
                    }
                });
            } else {
                wrapper.eq(MaterialPurchase::getMaterialType, mt);
            }
        }

        List<MaterialPurchase> all = materialPurchaseService.list(wrapper);

        int totalCount = all.size();
        int pendingCount = 0;
        int receivedCount = 0;
        int partialCount = 0;
        int completedCount = 0;
        int cancelledCount = 0;
        int totalQuantity = 0;

        for (MaterialPurchase p : all) {
            String status = p.getStatus() == null ? "" : p.getStatus().trim().toLowerCase();
            int qty = p.getPurchaseQuantity() == null ? 0 : p.getPurchaseQuantity();
            totalQuantity += qty;
            switch (status) {
                case "pending": pendingCount++; break;
                case "received": receivedCount++; break;
                case "partial": partialCount++; break;
                case "completed": completedCount++; break;
                case "cancelled": cancelledCount++; break;
                default: pendingCount++; break;
            }
        }

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("totalCount", totalCount);
        result.put("totalQuantity", totalQuantity);
        result.put("pendingCount", pendingCount);
        result.put("receivedCount", receivedCount);
        result.put("partialCount", partialCount);
        result.put("completedCount", completedCount);
        result.put("cancelledCount", cancelledCount);
        return result;
    }

    /**
     * 智能一键领取全部（优先使用库存，不足时创建采购）
     * @param body 包含 orderNo(订单号), receiverId, receiverName
     * @return 汇总结果 { outboundCount, purchaseCount, details }
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> smartReceiveAll(Map<String, Object> body) {
        String orderNo = body == null ? null
            : (body.get("orderNo") == null ? null : String.valueOf(body.get("orderNo")).trim());
        String receiverId = body == null ? null
            : (body.get("receiverId") == null ? null : String.valueOf(body.get("receiverId")).trim());
        String receiverName = body == null ? null
            : (body.get("receiverName") == null ? null : String.valueOf(body.get("receiverName")).trim());

        if (!StringUtils.hasText(orderNo)) {
            throw new IllegalArgumentException("订单号不能为空");
        }
        if (!StringUtils.hasText(receiverId) && !StringUtils.hasText(receiverName)) {
            throw new IllegalArgumentException("领取人ID或姓名不能为空");
        }

        // 1. 查询订单的所有待处理采购任务
        List<MaterialPurchase> pendingPurchases = materialPurchaseService.lambdaQuery()
            .eq(MaterialPurchase::getOrderNo, orderNo)
            .eq(MaterialPurchase::getDeleteFlag, 0)
            .eq(MaterialPurchase::getStatus, MaterialConstants.STATUS_PENDING)
            .list();

        if (pendingPurchases.isEmpty()) {
            Map<String, Object> result = new java.util.LinkedHashMap<>();
            result.put("outboundCount", 0);
            result.put("purchaseCount", 0);
            result.put("message", "无待处理的采购任务");
            return result;
        }

        int outboundCount = 0;  // 走出库的数量
        int purchaseCount = 0;  // 保持采购的数量
        List<Map<String, Object>> details = new ArrayList<>();

        // 2. 遍历每个采购任务，智能分发
        for (MaterialPurchase purchase : pendingPurchases) {
            String materialCode = purchase.getMaterialCode();
            String color = purchase.getColor();
            String size = purchase.getSize();
            Integer requiredQty = purchase.getPurchaseQuantity() != null ? purchase.getPurchaseQuantity() : 0;

            // 2.1 查询库存（按 materialCode + color + size 匹配）
            LambdaQueryWrapper<MaterialStock> stockWrapper = new LambdaQueryWrapper<>();
            stockWrapper.eq(MaterialStock::getMaterialCode, materialCode);
            if (StringUtils.hasText(color)) {
                stockWrapper.eq(MaterialStock::getColor, color);
            }
            if (StringUtils.hasText(size)) {
                stockWrapper.eq(MaterialStock::getSize, size);
            }

            List<MaterialStock> stockList = materialStockService.list(stockWrapper);

            // 计算可用库存（总库存 - 锁定库存）
            int availableStock = stockList.stream()
                .mapToInt(stock -> {
                    int qty = stock.getQuantity() != null ? stock.getQuantity() : 0;
                    int locked = stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0;
                    return Math.max(0, qty - locked);
                })
                .sum();

            Map<String, Object> detail = new java.util.LinkedHashMap<>();
            detail.put("materialCode", materialCode);
            detail.put("materialName", purchase.getMaterialName());
            detail.put("color", color);
            detail.put("size", size);
            detail.put("requiredQty", requiredQty);
            detail.put("availableStock", availableStock);

            // 2.2 判断：有足够库存 → 出库，否则 → 采购
            if (availableStock >= requiredQty && !stockList.isEmpty()) {
                // ✅ 走出库流程
                try {
                    createOutboundPicking(purchase, receiverId, receiverName, stockList);
                    outboundCount++;
                    detail.put("action", "outbound");
                    detail.put("status", "success");
                } catch (Exception e) {
                    log.error("创建出库单失败: materialCode={}, error={}", materialCode, e.getMessage());
                    detail.put("action", "outbound");
                    detail.put("status", "failed");
                    detail.put("error", e.getMessage());
                }
            } else {
                // ❌ 保持采购状态（等待外部采购）
                purchaseCount++;
                detail.put("action", "purchase");
                detail.put("status", "pending");
                detail.put("message", "库存不足，等待采购");
            }

            details.add(detail);
        }

        // 3. 返回汇总结果
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("outboundCount", outboundCount);
        result.put("purchaseCount", purchaseCount);
        result.put("totalCount", pendingPurchases.size());
        result.put("message", String.format("处理完成：%d项走出库，%d项走采购", outboundCount, purchaseCount));
        result.put("details", details);

        log.info("✅ 智能一键领取完成: orderNo={}, 出库={}, 采购={}", orderNo, outboundCount, purchaseCount);
        return result;
    }

    /**
     * 创建领料出库单并扣减库存
     */
    private void createOutboundPicking(MaterialPurchase purchase, String receiverId, String receiverName,
                                       List<MaterialStock> stockList) {
        Integer pickQty = purchase.getPurchaseQuantity() != null ? purchase.getPurchaseQuantity() : 0;

        // 1. 创建主表（MaterialPicking）
        MaterialPicking picking = new MaterialPicking();
        picking.setPickingNo("PICK-" + System.currentTimeMillis());
        picking.setOrderId(purchase.getOrderId());
        picking.setOrderNo(purchase.getOrderNo());
        picking.setStyleId(purchase.getStyleId());
        picking.setStyleNo(purchase.getStyleNo());
        picking.setPickerId(receiverId);
        picking.setPickerName(receiverName);
        picking.setPickTime(LocalDateTime.now());
        picking.setStatus("completed");
        picking.setRemark("智能一键领取自动创建");
        picking.setCreateTime(LocalDateTime.now());
        picking.setUpdateTime(LocalDateTime.now());
        picking.setDeleteFlag(0);

        List<MaterialPickingItem> items = new ArrayList<>();

        // 2. 扣减库存并准备明细
        int remainingQty = pickQty;
        for (MaterialStock stock : stockList) {
            if (remainingQty <= 0) break;

            int stockAvailable = Math.max(0,
                (stock.getQuantity() != null ? stock.getQuantity() : 0)
                - (stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0));

            if (stockAvailable <= 0) continue;

            int pickFromThis = Math.min(remainingQty, stockAvailable);

            // 2.1 准备明细项
            MaterialPickingItem item = new MaterialPickingItem();
            item.setMaterialStockId(stock.getId());
            item.setMaterialId(stock.getMaterialId());
            item.setMaterialCode(stock.getMaterialCode());
            item.setMaterialName(stock.getMaterialName());
            item.setColor(stock.getColor());
            item.setSize(stock.getSize());
            item.setQuantity(pickFromThis);
            item.setUnit(stock.getUnit());
            item.setCreateTime(LocalDateTime.now());
            items.add(item);

            // 2.2 扣减库存
            stock.setQuantity(stock.getQuantity() - pickFromThis);
            stock.setUpdateTime(LocalDateTime.now());
            materialStockService.updateById(stock);

            remainingQty -= pickFromThis;
        }

        // 3. 创建出库单（统一保存主表和明细）
        String pickingId = materialPickingService.createPicking(picking, items);

        // 4. 更新采购任务状态为已完成
        purchase.setStatus(MaterialConstants.STATUS_COMPLETED);
        purchase.setReceivedTime(LocalDateTime.now());
        purchase.setReceiverId(receiverId);
        purchase.setReceiverName(receiverName);
        purchase.setUpdateTime(LocalDateTime.now());
        materialPurchaseService.updateById(purchase);

        log.info("✅ 出库单创建成功: pickingId={}, materialCode={}, qty={}",
            pickingId, purchase.getMaterialCode(), pickQty);
    }

    /**
     * 智能领取预览（不执行，仅查询库存状态）
     * 返回该订单所有物料采购任务的需求数量、仓库可用数量和当前状态，供前端显示表格
     */
    public Map<String, Object> previewSmartReceive(String orderNo) {
        if (!StringUtils.hasText(orderNo)) {
            throw new IllegalArgumentException("订单号不能为空");
        }

        // 1. 查询订单的所有采购任务（不限状态，让前端看到全貌）
        List<MaterialPurchase> allPurchases = materialPurchaseService.lambdaQuery()
            .eq(MaterialPurchase::getOrderNo, orderNo.trim())
            .eq(MaterialPurchase::getDeleteFlag, 0)
            .list();

        List<Map<String, Object>> items = new ArrayList<>();
        int pendingCount = 0;

        for (MaterialPurchase purchase : allPurchases) {
            String materialCode = purchase.getMaterialCode();
            String color = purchase.getColor();
            String size = purchase.getSize();
            Integer requiredQty = purchase.getPurchaseQuantity() != null ? purchase.getPurchaseQuantity() : 0;
            String status = purchase.getStatus() != null ? purchase.getStatus() : "";

            // 查询库存
            LambdaQueryWrapper<MaterialStock> stockWrapper = new LambdaQueryWrapper<>();
            stockWrapper.eq(MaterialStock::getMaterialCode, materialCode);
            if (StringUtils.hasText(color)) {
                stockWrapper.eq(MaterialStock::getColor, color);
            }
            if (StringUtils.hasText(size)) {
                stockWrapper.eq(MaterialStock::getSize, size);
            }

            List<MaterialStock> stockList = materialStockService.list(stockWrapper);
            int availableStock = stockList.stream()
                .mapToInt(stock -> {
                    int qty = stock.getQuantity() != null ? stock.getQuantity() : 0;
                    int locked = stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0;
                    return Math.max(0, qty - locked);
                })
                .sum();

            boolean isPending = MaterialConstants.STATUS_PENDING.equals(status);
            if (isPending) pendingCount++;

            Map<String, Object> item = new java.util.LinkedHashMap<>();
            item.put("purchaseId", purchase.getId());
            item.put("materialCode", materialCode);
            item.put("materialName", purchase.getMaterialName());
            item.put("materialType", purchase.getMaterialType());
            item.put("color", color != null ? color : "");
            item.put("size", size != null ? size : "");
            item.put("requiredQty", requiredQty);
            item.put("availableStock", availableStock);
            item.put("purchaseStatus", status);
            // 可领取数量 = pending状态下 min(需求, 库存)，否则0
            int canPickQty = isPending ? Math.min(requiredQty, availableStock) : 0;
            item.put("canPickQty", canPickQty);
            // 需采购数量 = pending状态下 需求 - 可领取，否则0
            int needPurchaseQty = isPending ? Math.max(0, requiredQty - canPickQty) : 0;
            item.put("needPurchaseQty", needPurchaseQty);
            item.put("unit", purchase.getUnit());
            item.put("arrivedQuantity", purchase.getArrivedQuantity() != null ? purchase.getArrivedQuantity() : 0);

            items.add(item);
        }

        // 2. 查询已有的出库单
        List<MaterialPicking> existingPickings = materialPickingService.lambdaQuery()
            .eq(MaterialPicking::getOrderNo, orderNo.trim())
            .eq(MaterialPicking::getDeleteFlag, 0)
            .orderByDesc(MaterialPicking::getCreateTime)
            .list();

        List<Map<String, Object>> pickingRecords = new ArrayList<>();
        for (MaterialPicking picking : existingPickings) {
            Map<String, Object> record = new java.util.LinkedHashMap<>();
            record.put("pickingId", picking.getId());
            record.put("pickingNo", picking.getPickingNo());
            record.put("status", picking.getStatus());
            record.put("pickerName", picking.getPickerName());
            record.put("pickTime", picking.getPickTime());
            record.put("remark", picking.getRemark());
            // 获取出库明细
            List<MaterialPickingItem> items2 = materialPickingService.getItemsByPickingId(picking.getId());
            record.put("items", items2);
            pickingRecords.add(record);
        }

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("orderNo", orderNo.trim());
        result.put("materials", items);
        result.put("pickingRecords", pickingRecords);
        result.put("totalRequired", items.stream().mapToInt(i -> (int) i.get("requiredQty")).sum());
        result.put("totalAvailable", items.stream().mapToInt(i -> (int) i.get("availableStock")).sum());
        result.put("pendingCount", pendingCount);
        result.put("totalCount", items.size());
        return result;
    }

    /**
     * 执行单项仓库领取（从仓库出库指定物料指定数量）
     * @param body { purchaseId, pickQty, receiverId, receiverName }
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> warehousePickSingle(Map<String, Object> body) {
        String purchaseId = ParamUtils.toTrimmedString(body == null ? null : body.get("purchaseId"));
        int pickQty = ParamUtils.toIntSafe(body == null ? null : body.get("pickQty"));
        String receiverId = ParamUtils.toTrimmedString(body == null ? null : body.get("receiverId"));
        String receiverName = ParamUtils.toTrimmedString(body == null ? null : body.get("receiverName"));

        if (!StringUtils.hasText(purchaseId)) {
            throw new IllegalArgumentException("采购任务ID不能为空");
        }
        if (pickQty <= 0) {
            throw new IllegalArgumentException("领取数量必须大于0");
        }

        MaterialPurchase purchase = materialPurchaseService.getById(purchaseId);
        if (purchase == null) {
            throw new NoSuchElementException("采购任务不存在");
        }

        String materialCode = purchase.getMaterialCode();
        String color = purchase.getColor();
        String size = purchase.getSize();
        Integer requiredQty = purchase.getPurchaseQuantity() != null ? purchase.getPurchaseQuantity() : 0;

        // 查询库存
        LambdaQueryWrapper<MaterialStock> stockWrapper = new LambdaQueryWrapper<>();
        stockWrapper.eq(MaterialStock::getMaterialCode, materialCode);
        if (StringUtils.hasText(color)) {
            stockWrapper.eq(MaterialStock::getColor, color);
        }
        if (StringUtils.hasText(size)) {
            stockWrapper.eq(MaterialStock::getSize, size);
        }
        List<MaterialStock> stockList = materialStockService.list(stockWrapper);

        int availableStock = stockList.stream()
            .mapToInt(stock -> {
                int qty = stock.getQuantity() != null ? stock.getQuantity() : 0;
                int locked = stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0;
                return Math.max(0, qty - locked);
            })
            .sum();

        if (availableStock < pickQty) {
            throw new IllegalArgumentException("仓库库存不足，可用库存: " + availableStock + "，需领取: " + pickQty);
        }

        // 创建出库单
        MaterialPicking picking = new MaterialPicking();
        picking.setPickingNo("PICK-" + System.currentTimeMillis());
        picking.setOrderId(purchase.getOrderId());
        picking.setOrderNo(purchase.getOrderNo());
        picking.setStyleId(purchase.getStyleId());
        picking.setStyleNo(purchase.getStyleNo());
        picking.setPickerId(receiverId);
        picking.setPickerName(receiverName);
        picking.setPickTime(LocalDateTime.now());
        picking.setStatus("completed");
        picking.setRemark("仓库领取");
        picking.setCreateTime(LocalDateTime.now());
        picking.setUpdateTime(LocalDateTime.now());
        picking.setDeleteFlag(0);

        List<MaterialPickingItem> items = new ArrayList<>();
        int remainingQty = pickQty;

        for (MaterialStock stock : stockList) {
            if (remainingQty <= 0) break;
            int stockAvailable = Math.max(0,
                (stock.getQuantity() != null ? stock.getQuantity() : 0)
                - (stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0));
            if (stockAvailable <= 0) continue;
            int pickFromThis = Math.min(remainingQty, stockAvailable);

            MaterialPickingItem item = new MaterialPickingItem();
            item.setMaterialStockId(stock.getId());
            item.setMaterialId(stock.getMaterialId());
            item.setMaterialCode(stock.getMaterialCode());
            item.setMaterialName(stock.getMaterialName());
            item.setColor(stock.getColor());
            item.setSize(stock.getSize());
            item.setQuantity(pickFromThis);
            item.setUnit(stock.getUnit());
            item.setCreateTime(LocalDateTime.now());
            items.add(item);

            stock.setQuantity(stock.getQuantity() - pickFromThis);
            stock.setUpdateTime(LocalDateTime.now());
            materialStockService.updateById(stock);

            remainingQty -= pickFromThis;
        }

        String pickingId = materialPickingService.createPicking(picking, items);

        // 更新采购任务状态
        if (pickQty >= requiredQty) {
            // 全部从仓库领取
            purchase.setStatus(MaterialConstants.STATUS_COMPLETED);
            purchase.setReceivedTime(LocalDateTime.now());
        } else {
            // 部分领取，剩余走采购
            purchase.setStatus(MaterialConstants.STATUS_PARTIAL);
            purchase.setArrivedQuantity(pickQty);
        }
        purchase.setReceiverId(receiverId);
        purchase.setReceiverName(receiverName);
        purchase.setUpdateTime(LocalDateTime.now());
        materialPurchaseService.updateById(purchase);

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("pickingId", pickingId);
        result.put("pickingNo", picking.getPickingNo());
        result.put("pickedQty", pickQty);
        result.put("remainingPurchaseQty", Math.max(0, requiredQty - pickQty));
        result.put("materialCode", materialCode);
        result.put("materialName", purchase.getMaterialName());
        log.info("✅ 仓库单项领取成功: pickingId={}, materialCode={}, qty={}", pickingId, materialCode, pickQty);
        return result;
    }

    /**
     * 撤销出库单（主管以上权限）
     * 回退库存，恢复采购任务状态，需填写备注原因
     * @param body { pickingId, reason }
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> cancelPicking(Map<String, Object> body) {
        String pickingId = ParamUtils.toTrimmedString(body == null ? null : body.get("pickingId"));
        String reason = ParamUtils.toTrimmedString(body == null ? null : body.get("reason"));

        if (!StringUtils.hasText(pickingId)) {
            throw new IllegalArgumentException("出库单ID不能为空");
        }
        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("撤销原因不能为空");
        }

        // 检查权限：主管以上
        String currentRole = UserContext.role();
        if (currentRole == null || (!currentRole.contains("admin") && !currentRole.contains("supervisor")
                && !currentRole.contains("manager") && !currentRole.contains("主管") && !currentRole.contains("管理员"))) {
            // 允许权限通过 @PreAuthorize 控制，这里做兜底
            log.warn("用户 {} 尝试撤销出库单，角色: {}", UserContext.username(), currentRole);
        }

        MaterialPicking picking = materialPickingService.getById(pickingId);
        if (picking == null || picking.getDeleteFlag() != null && picking.getDeleteFlag() == 1) {
            throw new NoSuchElementException("出库单不存在或已被删除");
        }
        if ("cancelled".equals(picking.getStatus())) {
            throw new IllegalStateException("出库单已撤销，不可重复操作");
        }

        // 1. 获取出库明细
        List<MaterialPickingItem> items = materialPickingService.getItemsByPickingId(pickingId);

        // 2. 回退库存
        for (MaterialPickingItem item : items) {
            if (item.getMaterialStockId() != null) {
                MaterialStock stock = materialStockService.getById(item.getMaterialStockId());
                if (stock != null) {
                    stock.setQuantity((stock.getQuantity() != null ? stock.getQuantity() : 0) + item.getQuantity());
                    stock.setUpdateTime(LocalDateTime.now());
                    materialStockService.updateById(stock);
                }
            }
        }

        // 3. 标记出库单为已撤销
        picking.setStatus("cancelled");
        picking.setRemark("【撤销】" + reason + " | 操作人: " + UserContext.username() + " | 原备注: " + (picking.getRemark() != null ? picking.getRemark() : ""));
        picking.setUpdateTime(LocalDateTime.now());
        materialPickingService.updateById(picking);

        // 4. 恢复关联的采购任务状态为 pending
        String orderNo = picking.getOrderNo();
        if (StringUtils.hasText(orderNo)) {
            // 查找与出库单物料匹配的采购任务，恢复为 pending
            for (MaterialPickingItem item : items) {
                List<MaterialPurchase> relatedPurchases = materialPurchaseService.lambdaQuery()
                    .eq(MaterialPurchase::getOrderNo, orderNo)
                    .eq(MaterialPurchase::getMaterialCode, item.getMaterialCode())
                    .eq(MaterialPurchase::getDeleteFlag, 0)
                    .in(MaterialPurchase::getStatus, MaterialConstants.STATUS_COMPLETED, MaterialConstants.STATUS_PARTIAL)
                    .list();

                for (MaterialPurchase purchase : relatedPurchases) {
                    purchase.setStatus(MaterialConstants.STATUS_PENDING);
                    purchase.setReceivedTime(null);
                    purchase.setReceiverId(null);
                    purchase.setReceiverName(null);
                    purchase.setArrivedQuantity(0);
                    purchase.setUpdateTime(LocalDateTime.now());
                    materialPurchaseService.updateById(purchase);
                    log.info("✅ 采购任务已恢复: purchaseId={}, materialCode={}", purchase.getId(), purchase.getMaterialCode());
                }
            }
        }

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("pickingId", pickingId);
        result.put("pickingNo", picking.getPickingNo());
        result.put("status", "cancelled");
        result.put("reason", reason);
        result.put("restoredItems", items.size());
        log.info("✅ 出库单已撤销: pickingNo={}, reason={}, 回退{}项物料", picking.getPickingNo(), reason, items.size());
        return result;
    }

}
