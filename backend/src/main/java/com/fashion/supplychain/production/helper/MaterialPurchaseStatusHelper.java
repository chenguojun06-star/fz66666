package com.fashion.supplychain.production.helper;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.DataPermissionHelper;
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
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class MaterialPurchaseStatusHelper {

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
    private MaterialQualityIssueOrchestrator materialQualityIssueOrchestrator;

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
                MaterialPurchase toUpdate = new MaterialPurchase();
                toUpdate.setId(purchaseId);
                toUpdate.setEvidenceImageUrls(urls);
                materialPurchaseService.updateById(toUpdate);
            }
        }

        boolean ok = this.returnConfirmAndSync(purchaseId, confirmerId, confirmerName, returnQuantity);
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

        String operator = UserContext.username();
        String existingRemark = purchase.getRemark() != null ? purchase.getRemark() : "";
        String newRemark = "【撤回领取】" + reason + " | 操作人: " + operator + (existingRemark.isEmpty() ? "" : " | 原备注: " + existingRemark);

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

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("purchaseId", purchaseId);
        result.put("purchaseNo", purchase.getPurchaseNo());
        result.put("materialName", purchase.getMaterialName());
        result.put("status", MaterialConstants.STATUS_PENDING);
        result.put("reason", reason);
        log.info("✅ 采购领取已撤回: purchaseId={}, purchaseNo={}, operator={}, reason={}",
                purchaseId, purchase.getPurchaseNo(), operator, reason);
        return result;
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
        MaterialPurchase updated = materialPurchaseService.getById(purchaseId);
        if (updated != null) {
            syncAfterPurchaseChanged(updated);
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
            helper.ensureOrderStatusProduction(oid);
            helper.recomputeAndUpdateMaterialArrivalRate(oid, productionOrderOrchestrator);
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
