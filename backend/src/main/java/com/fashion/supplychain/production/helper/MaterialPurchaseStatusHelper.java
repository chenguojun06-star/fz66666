package com.fashion.supplychain.production.helper;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.finance.orchestration.MaterialReconciliationOrchestrator;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestratorHelper;
import com.fashion.supplychain.production.orchestration.MaterialQualityIssueOrchestrator;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Component
@Slf4j
@RequiredArgsConstructor
public class MaterialPurchaseStatusHelper {

    private final MaterialPurchaseService materialPurchaseService;

    private final ProductionOrderService productionOrderService;

    private final ProductionOrderOrchestrator productionOrderOrchestrator;

    private final ProductionOrderScanRecordDomainService scanRecordDomainService;

    private final MaterialReconciliationOrchestrator materialReconciliationOrchestrator;

    private final MaterialPurchaseOrchestratorHelper helper;

    private final MaterialQualityIssueOrchestrator materialQualityIssueOrchestrator;

    private final MaterialPickingService materialPickingService;


    private com.fashion.supplychain.production.service.SysNoticeService sysNoticeService;

    private com.fashion.supplychain.production.service.MaterialStockService materialStockService;

    private com.fashion.supplychain.websocket.service.WebSocketService webSocketService;

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

        boolean ok = this.receiveAndSync(
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
        try {
            Long tenantId = UserContext.tenantId();
            String orderNo = updated.getOrderNo() != null ? updated.getOrderNo() : "";
            String materialName = updated.getMaterialName() != null ? updated.getMaterialName() : "物料";
            String receiver = rname != null && !rname.isEmpty() ? rname : rid;
            com.fashion.supplychain.production.entity.SysNotice notice = new com.fashion.supplychain.production.entity.SysNotice();
            notice.setTenantId(tenantId);
            notice.setFromName(receiver);
            notice.setOrderNo(orderNo);
            notice.setTitle("📦 采购已领取 — " + materialName);
            notice.setContent(String.format("%s 已领取采购任务「%s」%s，请及时跟进到货进度。",
                receiver, materialName, orderNo.isEmpty() ? "" : "（订单 " + orderNo + "）"));
            notice.setNoticeType("procurement_received");
            notice.setIsRead(0);
            notice.setCreatedAt(LocalDateTime.now());
            sysNoticeService.save(notice);
        } catch (Exception e) {
            log.warn("[采购领取] 发送通知失败: {}", e.getMessage());
        }
        try {
            String orderNo = updated.getOrderNo() != null ? updated.getOrderNo() : "";
            String materialName = updated.getMaterialName() != null ? updated.getMaterialName() : "物料";
            String receiver = rname != null && !rname.isEmpty() ? rname : rid;
            String receiverId = rid != null && !rid.isEmpty() ? rid : "";
            webSocketService.notifyOrderProgressChanged(receiverId, orderNo, 0, "采购领取");
            webSocketService.notifyDataChanged(receiverId, "MaterialPurchase", purchaseId, "update");
            webSocketService.notifyProcessStageCompleted(receiverId, orderNo, "采购领取", receiver, "", "", "", 0);
        } catch (Exception e) {
            log.debug("[采购领取] WebSocket广播失败(不阻断): {}", e.getMessage());
        }
        return updated;
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

        List<String> validIds = purchaseIds.stream()
                .filter(id -> StringUtils.hasText(id))
                .map(String::trim)
                .distinct()
                .toList();
        Map<String, MaterialPurchase> purchaseMap = validIds.isEmpty()
                ? Map.of()
                : materialPurchaseService.listByIds(validIds).stream()
                        .collect(java.util.stream.Collectors.toMap(p -> String.valueOf(p.getId()).trim(), p -> p, (a, b) -> a));

        for (String pid : validIds) {
            try {
                MaterialPurchase purchase = purchaseMap.get(pid);
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

                boolean ok = this.receiveAndSync(
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

    @Transactional(rollbackFor = Exception.class)
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

        // 只查验证所需字段，避免未迁移列导致全字段SELECT 500
        MaterialPurchase purchase = materialPurchaseService.getOne(
                new LambdaQueryWrapper<MaterialPurchase>()
                        .select(MaterialPurchase::getId, MaterialPurchase::getDeleteFlag,
                                MaterialPurchase::getStatus)
                        .eq(MaterialPurchase::getId, purchaseId));
        if (purchase == null || (purchase.getDeleteFlag() != null && purchase.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("采购任务不存在");
        }

        if (materialQualityIssueOrchestrator.hasOpenIssue(purchaseId)) {
            throw new IllegalStateException("当前采购仍有未处理的品质异常，处理完成后才能确认回料");
        }

        String status = purchase.getStatus() == null ? "" : purchase.getStatus().trim();
        if (MaterialConstants.STATUS_CANCELLED.equals(status)) {
            throw new IllegalStateException("该采购任务已取消，无法回料确认");
        }

        if (returnQuantity == null) {
            throw new IllegalArgumentException("请填写实际回料数量");
        }
        if (returnQuantity < 0) {
            throw new IllegalArgumentException("实际回料数量不能小于0");
        }

        // 保存凭证图片 URLs
        Object rawUrls = body == null ? null : body.get("evidenceImageUrls");
        if (rawUrls != null) {
            String urls = String.valueOf(rawUrls).trim();
            if (!urls.isEmpty()) {
                try {
                    MaterialPurchase toUpdate = new MaterialPurchase();
                    toUpdate.setId(purchaseId);
                    toUpdate.setEvidenceImageUrls(urls);
                    materialPurchaseService.updateById(toUpdate);
                } catch (Exception e) {
                    log.warn("[returnConfirm] 保存凭证图片失败(列可能缺失): {}", e.getMessage());
                }
            }
        }

        boolean ok = this.returnConfirmAndSync(purchaseId, confirmerId, confirmerName, returnQuantity);
        if (!ok) {
            throw new IllegalStateException("回料确认失败");
        }

        // 优先全字段查询；若schema仍有缺列则降级到原始字段查询，并手动填充业务字段
        MaterialPurchase updated;
        try {
            updated = materialPurchaseService.getById(purchaseId);
        } catch (Exception e) {
            log.warn("[returnConfirm] 全字段查询失败(schema漂移)，降级安全查询: {}", e.getMessage());
            updated = materialPurchaseService.getOne(
                    new LambdaQueryWrapper<MaterialPurchase>()
                            .select(MaterialPurchase::getId, MaterialPurchase::getPurchaseNo,
                                    MaterialPurchase::getMaterialId, MaterialPurchase::getMaterialCode,
                                    MaterialPurchase::getMaterialName, MaterialPurchase::getMaterialType,
                                    MaterialPurchase::getSpecifications, MaterialPurchase::getUnit,
                                    MaterialPurchase::getPurchaseQuantity, MaterialPurchase::getArrivedQuantity,
                                    MaterialPurchase::getInboundRecordId, MaterialPurchase::getSupplierId,
                                    MaterialPurchase::getSupplierName, MaterialPurchase::getUnitPrice,
                                    MaterialPurchase::getTotalAmount, MaterialPurchase::getReceiverId,
                                    MaterialPurchase::getReceiverName, MaterialPurchase::getReceivedTime,
                                    MaterialPurchase::getRemark, MaterialPurchase::getOrderId,
                                    MaterialPurchase::getOrderNo, MaterialPurchase::getStyleId,
                                    MaterialPurchase::getStyleNo, MaterialPurchase::getStyleName,
                                    MaterialPurchase::getColor, MaterialPurchase::getSize,
                                    MaterialPurchase::getStatus, MaterialPurchase::getCreateTime,
                                    MaterialPurchase::getUpdateTime, MaterialPurchase::getDeleteFlag,
                                    MaterialPurchase::getCreatorId, MaterialPurchase::getCreatorName,
                                    MaterialPurchase::getUpdaterId, MaterialPurchase::getUpdaterName,
                                    MaterialPurchase::getExpectedArrivalDate, MaterialPurchase::getActualArrivalDate,
                                    MaterialPurchase::getTenantId)
                            .eq(MaterialPurchase::getId, purchaseId));
            if (updated != null) {
                // returnConfirmAndSync 已成功执行，手动填充回料确认字段
                updated.setReturnConfirmed(1);
                updated.setReturnQuantity(returnQuantity);
                updated.setReturnConfirmerId(confirmerId);
                updated.setReturnConfirmerName(confirmerName);
                updated.setReturnConfirmTime(LocalDateTime.now());
                updated.setUpdateTime(LocalDateTime.now());
            }
        }
        if (updated == null) {
            throw new IllegalStateException("回料确认失败");
        }
        if (updated.getUpdateTime() == null) {
            updated.setUpdateTime(LocalDateTime.now());
        }
        return updated;
    }

    public Map<String, Object> batchReturnConfirm(Map<String, Object> body) {
        if (body == null) throw new IllegalArgumentException("参数错误");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
        String confirmerId = body.get("confirmerId") == null ? null : String.valueOf(body.get("confirmerId"));
        String confirmerName = body.get("confirmerName") == null ? null : String.valueOf(body.get("confirmerName"));
        String evidenceImageUrls = body.get("evidenceImageUrls") == null ? null : String.valueOf(body.get("evidenceImageUrls")).trim();

        if (items == null || items.isEmpty()) throw new IllegalArgumentException("没有可回料确认的采购任务");
        if (!StringUtils.hasText(confirmerName)) throw new IllegalArgumentException("缺少确认人信息");

        int successCount = 0;
        int failCount = 0;
        List<String> errors = new ArrayList<>();

        for (Map<String, Object> item : items) {
            String purchaseId = item.get("purchaseId") == null ? null : String.valueOf(item.get("purchaseId"));
            Integer returnQuantity = helper.coerceInt(item.get("returnQuantity"));
            if (!StringUtils.hasText(purchaseId)) { failCount++; errors.add("缺少purchaseId"); continue; }

            try {
                Map<String, Object> singleBody = new java.util.HashMap<>();
                singleBody.put("purchaseId", purchaseId);
                singleBody.put("confirmerId", confirmerId);
                singleBody.put("confirmerName", confirmerName);
                singleBody.put("returnQuantity", returnQuantity);
                if (StringUtils.hasText(evidenceImageUrls)) singleBody.put("evidenceImageUrls", evidenceImageUrls);
                this.returnConfirm(singleBody);
                successCount++;
            } catch (Exception e) {
                failCount++;
                errors.add(purchaseId + ": " + e.getMessage());
            }
        }

        Map<String, Object> result = new java.util.HashMap<>();
        result.put("successCount", successCount);
        result.put("failCount", failCount);
        result.put("errors", errors);
        return result;
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

        // 只查验证所需字段，避免未迁移列导致全字段SELECT 500
        MaterialPurchase purchase = materialPurchaseService.getOne(
                new LambdaQueryWrapper<MaterialPurchase>()
                        .select(MaterialPurchase::getId, MaterialPurchase::getDeleteFlag,
                                MaterialPurchase::getOrderId, MaterialPurchase::getOrderNo,
                                MaterialPurchase::getStyleId, MaterialPurchase::getStyleNo)
                        .eq(MaterialPurchase::getId, purchaseId));
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

        MaterialPurchase updated;
        try {
            updated = materialPurchaseService.getById(purchaseId);
        } catch (Exception e) {
            log.warn("[resetReturnConfirm] 全字段查询失败(schema漂移)，降级安全查询: {}", e.getMessage());
            updated = materialPurchaseService.getOne(
                    new LambdaQueryWrapper<MaterialPurchase>()
                            .select(MaterialPurchase::getId, MaterialPurchase::getPurchaseNo,
                                    MaterialPurchase::getMaterialId, MaterialPurchase::getMaterialCode,
                                    MaterialPurchase::getMaterialName, MaterialPurchase::getStatus,
                                    MaterialPurchase::getOrderId, MaterialPurchase::getOrderNo,
                                    MaterialPurchase::getStyleId, MaterialPurchase::getStyleNo,
                                    MaterialPurchase::getCreateTime, MaterialPurchase::getUpdateTime,
                                    MaterialPurchase::getDeleteFlag, MaterialPurchase::getTenantId)
                            .eq(MaterialPurchase::getId, purchaseId));
            if (updated != null) {
                updated.setReturnConfirmed(0);
                updated.setUpdateTime(LocalDateTime.now());
            }
        }
        if (updated == null) {
            throw new IllegalStateException("退回处理失败");
        }
        if (updated.getUpdateTime() == null) {
            updated.setUpdateTime(LocalDateTime.now());
        }
        return updated;
    }

    /**
     * 撤回采购领取（到货登记）操作
     * 将已领取/已到货的采购任务恢复为待处理状态，清空到货数量和领取人信息
     * @param body { purchaseId, reason }
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> cancelReceive(Map<String, Object> body) {
        String purchaseId = ParamUtils.toTrimmedString(body == null ? null : body.get("purchaseId"));
        String reason = ParamUtils.toTrimmedString(body == null ? null : body.get("reason"));

        if (!org.springframework.util.StringUtils.hasText(purchaseId)) {
            throw new IllegalArgumentException("采购单ID不能为空");
        }
        if (!org.springframework.util.StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("撤回原因不能为空");
        }

        MaterialPurchase purchase = materialPurchaseService.getById(purchaseId);
        if (purchase == null || (purchase.getDeleteFlag() != null && purchase.getDeleteFlag() == 1)) {
            throw new NoSuchElementException("采购单不存在或已删除");
        }

        String currentStatus = purchase.getStatus() == null ? "" : purchase.getStatus().trim();
        if (MaterialConstants.STATUS_PENDING.equals(currentStatus)) {
            throw new IllegalStateException("该采购单尚未领取，无需撤回");
        }
        if (MaterialConstants.STATUS_CANCELLED.equals(currentStatus)) {
            throw new IllegalStateException("该采购单已取消，不可操作");
        }

        com.fashion.supplychain.production.entity.MaterialPicking pendingPicking = materialPickingService.getOne(
                new LambdaQueryWrapper<com.fashion.supplychain.production.entity.MaterialPicking>()
                        .eq(com.fashion.supplychain.production.entity.MaterialPicking::getOrderNo, purchase.getOrderNo())
                        .eq(com.fashion.supplychain.production.entity.MaterialPicking::getStatus, "pending")
                        .orderByDesc(com.fashion.supplychain.production.entity.MaterialPicking::getCreateTime)
                        .last("LIMIT 1"), false);
        if (pendingPicking != null) {
            throw new IllegalStateException("该采购单存在待确认出库单（" + pendingPicking.getPickingNo() + "），请先撤销出库单");
        }

        String operator = UserContext.username();
        String existingRemark = purchase.getRemark() != null ? purchase.getRemark() : "";
        String newRemark = "【撤回采购】" + reason + " | 操作人: " + operator + (existingRemark.isEmpty() ? "" : " | 原备注: " + existingRemark);

        LambdaUpdateWrapper<MaterialPurchase> uw = new LambdaUpdateWrapper<>();
        uw.eq(MaterialPurchase::getId, purchaseId)
          .set(MaterialPurchase::getStatus, MaterialConstants.STATUS_PENDING)
          .set(MaterialPurchase::getArrivedQuantity, 0)
          .set(MaterialPurchase::getReceiverId, null)
          .set(MaterialPurchase::getReceiverName, null)
          .set(MaterialPurchase::getReceivedTime, null)
          .set(MaterialPurchase::getRemark, newRemark)
          .set(MaterialPurchase::getUpdateTime, LocalDateTime.now());
        materialPurchaseService.update(uw);

        int arrivedQty = purchase.getArrivedQuantity() != null ? purchase.getArrivedQuantity() : 0;
        if (arrivedQty > 0) {
            String sourceType = purchase.getSourceType();
            boolean isOrderDriven = "order".equals(sourceType) || "sample".equals(sourceType);
            if (!isOrderDriven) {
                materialStockService.decreaseStockForCancelReceive(purchase, arrivedQty);
                log.info("cancelReceive 已回退库存: purchaseId={}, qty={}", purchaseId, arrivedQty);
            }
        }

        materialReconciliationOrchestrator.upsertFromPurchaseId(purchaseId);
        log.info("cancelReceive 已同步物料对账: purchaseId={}", purchaseId);

        if (StringUtils.hasText(purchase.getOrderId())) {
            helper.recomputeAndUpdateMaterialArrivalRate(purchase.getOrderId(), productionOrderOrchestrator);
            log.info("cancelReceive 已重算面料到货率: orderId={}", purchase.getOrderId());
        }

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("purchaseId", purchaseId);
        result.put("purchaseNo", purchase.getPurchaseNo());
        result.put("materialName", purchase.getMaterialName());
        result.put("status", MaterialConstants.STATUS_PENDING);
        result.put("reason", reason);
        log.info("采购已撤回: purchaseId={}, purchaseNo={}, operator={}, reason={}",
                purchaseId, purchase.getPurchaseNo(), operator, reason);
        return result;
    }

    /**
     * 确认采购完成
     * 将待确认完成(awaiting_confirm)状态的采购任务标记为已完成(completed)
     * @param body { purchaseId }
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> confirmComplete(Map<String, Object> body) {
        String purchaseId = ParamUtils.toTrimmedString(body == null ? null : body.get("purchaseId"));

        if (!org.springframework.util.StringUtils.hasText(purchaseId)) {
            throw new IllegalArgumentException("采购单ID不能为空");
        }

        MaterialPurchase purchase = materialPurchaseService.getById(purchaseId);
        if (purchase == null || (purchase.getDeleteFlag() != null && purchase.getDeleteFlag() == 1)) {
            throw new NoSuchElementException("采购单不存在或已删除");
        }

        String currentStatus = purchase.getStatus() == null ? "" : purchase.getStatus().trim();
        if (MaterialConstants.STATUS_COMPLETED.equals(currentStatus)) {
            throw new IllegalStateException("该采购单已完成，无需重复确认");
        }
        if (MaterialConstants.STATUS_CANCELLED.equals(currentStatus)) {
            throw new IllegalStateException("该采购单已取消，无法确认完成");
        }

        String operator = UserContext.username();

        LambdaUpdateWrapper<MaterialPurchase> uw = new LambdaUpdateWrapper<>();
        uw.eq(MaterialPurchase::getId, purchaseId)
          .set(MaterialPurchase::getStatus, MaterialConstants.STATUS_COMPLETED)
          .set(MaterialPurchase::getUpdateTime, LocalDateTime.now());
        materialPurchaseService.update(uw);

        MaterialPurchase updated = materialPurchaseService.getById(purchaseId);
        if (updated != null) {
            syncAfterPurchaseChanged(updated);
            tryMarkOrderProcurementComplete(updated);
        }

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("purchaseId", purchaseId);
        result.put("purchaseNo", purchase.getPurchaseNo());
        result.put("materialName", purchase.getMaterialName());
        result.put("status", MaterialConstants.STATUS_COMPLETED);
        log.info("采购已确认完成: purchaseId={}, purchaseNo={}, operator={}",
                purchaseId, purchase.getPurchaseNo(), operator);
        return result;
    }

    /**
     * 确认完成后，检查该订单是否所有采购单均已 completed 或 cancelled。
     * 若是，则将生产订单的 procurement_manually_completed 置为 1，同时记录确认人与时间。
     * 这使得 OrderFlowStageFillHelper.fillProcurementDisplay() 能在订单列表响应中写入
     * procurementEndTime，前端进度球下方才能显示采购完成时间。
     * 此方法设计为不抛出异常，失败只记录 warn 日志，不影响主流程。
     */
    private void tryMarkOrderProcurementComplete(MaterialPurchase purchase) {
        if (!org.springframework.util.StringUtils.hasText(purchase.getOrderId())) return;
        String oid = purchase.getOrderId().trim();
        try {
            // 统计仍在进行中（非 completed、非 cancelled）的采购数
            long inProgressCount = materialPurchaseService.count(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialPurchase>()
                            .eq(MaterialPurchase::getOrderId, oid)
                            .ne(MaterialPurchase::getDeleteFlag, 1)
                            .notIn(MaterialPurchase::getStatus,
                                    MaterialConstants.STATUS_COMPLETED,
                                    MaterialConstants.STATUS_CANCELLED));
            if (inProgressCount > 0) return;

            // 所有采购均已 completed/cancelled → 确认订单尚未手工标记时再写入
            ProductionOrder existOrder = productionOrderService.getOne(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId, ProductionOrder::getProcurementManuallyCompleted)
                            .eq(ProductionOrder::getId, oid),
                    false);
            if (existOrder == null) return;
            if (existOrder.getProcurementManuallyCompleted() != null
                    && existOrder.getProcurementManuallyCompleted() == 1) return;

            LambdaUpdateWrapper<ProductionOrder> ouw = new LambdaUpdateWrapper<>();
            ouw.eq(ProductionOrder::getId, oid)
               .set(ProductionOrder::getProcurementManuallyCompleted, 1)
               .set(ProductionOrder::getProcurementConfirmedAt, LocalDateTime.now())
               .set(ProductionOrder::getProcurementConfirmedBy, UserContext.userId())
               .set(ProductionOrder::getProcurementConfirmedByName, UserContext.username());
            productionOrderService.update(ouw);
            log.info("✅ 所有采购单已完成，订单采购自动标记手工确认: orderId={}", oid);
        } catch (Exception e) {
            log.warn("[confirmComplete] 自动标记采购手工完成失败（不影响主流程）: orderId={}, error={}", oid, e.getMessage());
        }
    }

    public boolean receiveAndSync(String purchaseId, String receiverId, String receiverName) {
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

    public boolean returnConfirmAndSync(String purchaseId, String confirmerId, String confirmerName,
            Integer returnQuantity) {
        boolean ok = materialPurchaseService.confirmReturnPurchase(purchaseId, confirmerId, confirmerName,
                returnQuantity);
        if (!ok) {
            return false;
        }
        // 只查sync所需字段，避免未迁移列导致全字段SELECT 500
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

        // 直采直用场景：
        // 1) 无 orderId 的采购（批量/库存/手工）直接进入物料对账
        // 2) INTERNAL 内部订单采购对齐样衣逻辑，采购完成后直接进入物料对账
        // 3) 其他订单采购（如 EXTERNAL）仍走入库回流链路
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

        if (StringUtils.hasText(purchase.getOrderId())) {
            String oid = purchase.getOrderId().trim();
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

    private boolean isInternalOrderPurchase(MaterialPurchase purchase) {
        if (purchase == null || !StringUtils.hasText(purchase.getOrderId())) {
            return false;
        }
        if (StringUtils.hasText(purchase.getFactoryType())) {
            return "INTERNAL".equalsIgnoreCase(purchase.getFactoryType().trim());
        }
        try {
            ProductionOrder order = productionOrderService.getById(purchase.getOrderId().trim());
            return order != null
                    && StringUtils.hasText(order.getFactoryType())
                    && "INTERNAL".equalsIgnoreCase(order.getFactoryType().trim());
        } catch (Exception e) {
            log.warn("syncAfterPurchaseChanged: 识别内部订单失败，按非内部处理 purchaseId={}, orderId={}",
                    purchase.getId(), purchase.getOrderId(), e);
            return false;
        }
    }
}
