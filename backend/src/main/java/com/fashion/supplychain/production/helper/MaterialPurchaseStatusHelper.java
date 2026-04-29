package com.fashion.supplychain.production.helper;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.function.Supplier;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.finance.orchestration.MaterialReconciliationOrchestrator;
import com.fashion.supplychain.production.entity.MaterialPurchase;
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


    private final com.fashion.supplychain.production.service.SysNoticeService sysNoticeService;

    private final com.fashion.supplychain.production.service.MaterialStockService materialStockService;

    private final com.fashion.supplychain.websocket.service.WebSocketService webSocketService;

    private final MaterialPurchaseSyncHelper materialPurchaseSyncHelper;

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

        MaterialPurchase purchase = getPurchaseWithTenant(purchaseId);
        if (purchase == null || (purchase.getDeleteFlag() != null && purchase.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("采购任务不存在");
        }

        String rid = helper.safe(receiverIdValue);
        String rname = helper.safe(receiverNameValue);
        validateReceivePermission(purchase, rid, rname);

        boolean ok = this.receiveAndSync(purchaseId,
                StringUtils.hasText(rid) ? rid : null,
                StringUtils.hasText(rname) ? rname : null);
        if (!ok) {
            handleReceiveFailure(purchaseId, rid, rname);
        }

        MaterialPurchase updated = getPurchaseWithTenant(purchaseId);
        if (updated == null) {
            throw new IllegalStateException("领取失败");
        }
        if (updated.getUpdateTime() == null) {
            updated.setUpdateTime(LocalDateTime.now());
        }
        sendReceiveNotice(updated, rid, rname);
        broadcastReceiveProgress(updated, rid, rname, purchaseId);
        return updated;
    }

    private void validateReceivePermission(MaterialPurchase purchase, String rid, String rname) {
        String status = purchase.getStatus() == null ? "" : purchase.getStatus().trim();
        String normalizedStatus = status.toLowerCase();
        if (MaterialConstants.STATUS_COMPLETED.equals(normalizedStatus) || MaterialConstants.STATUS_CANCELLED.equals(normalizedStatus)) {
            throw new IllegalStateException("该采购任务已结束，无法领取");
        }

        String existingReceiverId = purchase.getReceiverId() == null ? "" : purchase.getReceiverId().trim();
        String existingReceiverName = purchase.getReceiverName() == null ? "" : purchase.getReceiverName().trim();

        boolean alreadyReceived = !MaterialConstants.STATUS_PENDING.equals(normalizedStatus) && StringUtils.hasText(normalizedStatus);
        if (alreadyReceived) {
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
    }

    private void handleReceiveFailure(String purchaseId, String rid, String rname) {
        MaterialPurchase latest = getPurchaseWithTenant(purchaseId);
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

    private void sendReceiveNotice(MaterialPurchase updated, String rid, String rname) {
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
    }

    private void broadcastReceiveProgress(MaterialPurchase updated, String rid, String rname, String purchaseId) {
        try {
            String orderNo = updated.getOrderNo() != null ? updated.getOrderNo() : "";
            String receiver = rname != null && !rname.isEmpty() ? rname : rid;
            String receiverId = rid != null && !rid.isEmpty() ? rid : "";
            webSocketService.notifyOrderProgressChanged(receiverId, orderNo, 0, "采购领取");
            webSocketService.notifyDataChanged(receiverId, "MaterialPurchase", purchaseId, "update");
            webSocketService.notifyProcessStageCompleted(receiverId, orderNo, "采购领取", receiver, "", "", "", 0);
        } catch (Exception e) {
            log.debug("[采购领取] WebSocket广播失败(不阻断): {}", e.getMessage());
        }
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
                String outcome = processBatchReceiveItem(pid, purchaseMap.get(pid), rid, rname);
                if ("success".equals(outcome)) {
                    successCount++;
                } else if ("skip".equals(outcome)) {
                    skipCount++;
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

    private String processBatchReceiveItem(String pid, MaterialPurchase purchase, String rid, String rname) {
        if (purchase == null || (purchase.getDeleteFlag() != null && purchase.getDeleteFlag() != 0)) {
            return "skip";
        }
        String st = purchase.getStatus() == null ? "" : purchase.getStatus().trim().toLowerCase();
        if (MaterialConstants.STATUS_COMPLETED.equals(st) || MaterialConstants.STATUS_CANCELLED.equals(st)) {
            return "skip";
        }
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
                return "skip";
            }
        }
        boolean ok = this.receiveAndSync(pid,
                StringUtils.hasText(rid) ? rid : null,
                StringUtils.hasText(rname) ? rname : null);
        if (!ok) {
            throw new IllegalStateException("采购单 " + (purchase.getPurchaseNo() != null ? purchase.getPurchaseNo() : pid) + " 领取失败");
        }
        return "success";
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

        MaterialPurchase purchase = validateReturnConfirm(purchaseId, returnQuantity);
        saveEvidenceImages(purchaseId, body);

        boolean ok = this.returnConfirmAndSync(purchaseId, confirmerId, confirmerName, returnQuantity);
        if (!ok) {
            throw new IllegalStateException("回料确认失败");
        }

        MaterialPurchase updated = fetchUpdatedWithFallback(purchaseId, () -> {
            MaterialPurchase fallback = queryPurchaseSafeFields(purchaseId);
            if (fallback != null) {
                fallback.setReturnConfirmed(1);
                fallback.setReturnQuantity(returnQuantity);
                fallback.setReturnConfirmerId(confirmerId);
                fallback.setReturnConfirmerName(confirmerName);
                fallback.setReturnConfirmTime(LocalDateTime.now());
                fallback.setUpdateTime(LocalDateTime.now());
            }
            return fallback;
        });
        if (updated == null) {
            throw new IllegalStateException("回料确认失败");
        }
        if (updated.getUpdateTime() == null) {
            updated.setUpdateTime(LocalDateTime.now());
        }
        return updated;
    }

    private MaterialPurchase validateReturnConfirm(String purchaseId, Integer returnQuantity) {
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
        return purchase;
    }

    private void saveEvidenceImages(String purchaseId, Map<String, Object> body) {
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

    @Transactional(rollbackFor = Exception.class)
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

        syncAfterResetReturnConfirm(purchaseId, purchase);
        logOrchestrationFailureAfterReset(purchaseId, purchase);

        MaterialPurchase updated = fetchUpdatedWithFallback(purchaseId, () -> {
            MaterialPurchase fallback = queryPurchaseResetSafeFields(purchaseId);
            if (fallback != null) {
                fallback.setReturnConfirmed(0);
                fallback.setUpdateTime(LocalDateTime.now());
            }
            return fallback;
        });
        if (updated == null) {
            throw new IllegalStateException("退回处理失败");
        }
        if (updated.getUpdateTime() == null) {
            updated.setUpdateTime(LocalDateTime.now());
        }
        return updated;
    }

    private void syncAfterResetReturnConfirm(String purchaseId, MaterialPurchase purchase) {
        materialPurchaseSyncHelper.syncAfterResetReturnConfirm(purchaseId, purchase);
    }

    private void logOrchestrationFailureAfterReset(String purchaseId, MaterialPurchase purchase) {
        try {
            MaterialPurchase current = getPurchaseWithTenant(purchaseId);
            if (current != null && StringUtils.hasText(current.getOrderId())) {
                helper.ensureOrderStatusProduction(current.getOrderId());
                helper.recomputeAndUpdateMaterialArrivalRate(current.getOrderId(), productionOrderOrchestrator);
            }
        } catch (Exception e) {
            log.warn("Failed to sync order state after return confirm reset: purchaseId={}", purchaseId, e);
            scanRecordDomainService.insertOrchestrationFailure(
                    purchase.getOrderId(), purchase.getOrderNo(),
                    purchase.getStyleId(), purchase.getStyleNo(),
                    "syncOrderStateAfterReturnConfirmReset",
                    e == null ? "sync order state after return confirm reset failed"
                            : ("sync order state after return confirm reset failed: " + e.getMessage()),
                    LocalDateTime.now());
        }
    }

    private MaterialPurchase queryPurchaseResetSafeFields(String purchaseId) {
        return materialPurchaseService.getOne(
                new LambdaQueryWrapper<MaterialPurchase>()
                        .select(MaterialPurchase::getId, MaterialPurchase::getPurchaseNo,
                                MaterialPurchase::getMaterialId, MaterialPurchase::getMaterialCode,
                                MaterialPurchase::getMaterialName, MaterialPurchase::getStatus,
                                MaterialPurchase::getOrderId, MaterialPurchase::getOrderNo,
                                MaterialPurchase::getStyleId, MaterialPurchase::getStyleNo,
                                MaterialPurchase::getCreateTime, MaterialPurchase::getUpdateTime,
                                MaterialPurchase::getDeleteFlag, MaterialPurchase::getTenantId)
                        .eq(MaterialPurchase::getId, purchaseId));
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

        MaterialPurchase purchase = getPurchaseWithTenant(purchaseId);
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
          .set(MaterialPurchase::getReturnConfirmed, 0)
          .set(MaterialPurchase::getReturnQuantity, null)
          .set(MaterialPurchase::getReturnConfirmerId, null)
          .set(MaterialPurchase::getReturnConfirmerName, null)
          .set(MaterialPurchase::getReturnConfirmTime, null)
          .set(MaterialPurchase::getRemark, newRemark)
          .set(MaterialPurchase::getUpdateTime, LocalDateTime.now());
        materialPurchaseService.update(uw);

        rollbackStockIfNeeded(purchase, purchaseId);
        syncAfterCancelReceive(purchaseId, purchase);

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

    private void rollbackStockIfNeeded(MaterialPurchase purchase, String purchaseId) {
        int arrivedQty = purchase.getArrivedQuantity() != null ? purchase.getArrivedQuantity() : 0;
        if (arrivedQty > 0) {
            String sourceType = purchase.getSourceType();
            boolean isOrderDriven = "order".equals(sourceType) || "sample".equals(sourceType);
            if (!isOrderDriven) {
                materialStockService.decreaseStockForCancelReceive(purchase, arrivedQty);
                log.info("cancelReceive 已回退库存: purchaseId={}, qty={}", purchaseId, arrivedQty);
            }
        }
    }

    private void syncAfterCancelReceive(String purchaseId, MaterialPurchase purchase) {
        materialPurchaseSyncHelper.syncAfterCancelReceive(purchaseId, purchase);
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

        MaterialPurchase purchase = getPurchaseWithTenant(purchaseId);
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

        MaterialPurchase updated = getPurchaseWithTenant(purchaseId);
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
        materialPurchaseSyncHelper.tryMarkOrderProcurementComplete(purchase);
    }

    private LocalDateTime queryMaxPurchaseUpdateTime(String orderId) {
        return materialPurchaseSyncHelper.queryMaxPurchaseUpdateTime(orderId);
    }

    public boolean receiveAndSync(String purchaseId, String receiverId, String receiverName) {
        return materialPurchaseSyncHelper.receiveAndSync(purchaseId, receiverId, receiverName);
    }

    public boolean returnConfirmAndSync(String purchaseId, String confirmerId, String confirmerName,
            Integer returnQuantity) {
        return materialPurchaseSyncHelper.returnConfirmAndSync(purchaseId, confirmerId, confirmerName, returnQuantity);
    }

    public void syncAfterPurchaseChanged(MaterialPurchase purchase) {
        materialPurchaseSyncHelper.syncAfterPurchaseChanged(purchase);
    }

    private boolean isInternalOrderPurchase(MaterialPurchase purchase) {
        return materialPurchaseSyncHelper.isInternalOrderPurchase(purchase);
    }

    private MaterialPurchase fetchUpdatedWithFallback(String purchaseId, Supplier<MaterialPurchase> fallbackSupplier) {
        try {
            return getPurchaseWithTenant(purchaseId);
        } catch (Exception e) {
            log.warn("[fetchUpdatedWithFallback] 全字段查询失败(schema漂移)，降级安全查询: {}", e.getMessage());
            return fallbackSupplier.get();
        }
    }

    private MaterialPurchase queryPurchaseSafeFields(String purchaseId) {
        return materialPurchaseService.getOne(
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
    }

    private MaterialPurchase getPurchaseWithTenant(String purchaseId) {
        return materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getId, purchaseId)
                .eq(MaterialPurchase::getTenantId, com.fashion.supplychain.common.UserContext.tenantId())
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .one();
    }
}
