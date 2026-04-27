package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.entity.BillAggregation;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.finance.service.BillAggregationService;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator.BillPushRequest;
import com.fashion.supplychain.integration.openapi.service.WebhookPushService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.NoSuchElementException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import lombok.extern.slf4j.Slf4j;

/**
 * 财务对账状态编排器 - 统一对账单状态管理
 *
 * 主要职责：
 * 1. 统一管理物料对账单和成品对账单的状态流转
 * 2. 协调审批流程（提交、审核、付款、驳回）
 * 3. 自动识别对账单类型（物料/成品）并路由到对应服务
 * 4. 业务监控和 Webhook 事件推送
 *
 * 状态流转规则：
 * - draft(草稿) → submitted(已提交) → verified(已核实) → paid(已付款)
 * - 任意状态 → returned(已驳回) → draft(重新草稿)
 * - 每次状态变更均记录操作人、时间、备注
 *
 * 技术特点：
 * - 多态路由：根据 Scope 枚举自动路由到物料/成品对账服务
 * - 兼容模式：updateStatusCompat 支持自动识别对账单类型
 * - 事件驱动：状态变更后触发 Webhook 通知下游系统
 * - 权限控制：集成 UserContext 进行多租户隔离和操作权限校验
 *
 * 依赖服务：
 * - MaterialReconciliationService: 物料对账单服务
 * - ShipmentReconciliationService: 成品对账单服务
 * - WebhookPushService: Webhook 事件推送服务
 *
 * 使用示例：
 * <pre>
 * // 更新物料对账单状态
 * String newStatus = orchestrator.updateMaterialStatus("REC001", "verified");
 *
 * // 更新成品对账单状态
 * String newStatus = orchestrator.updateShipmentStatus("SHIP001", "paid");
 *
 * // 自动识别类型并更新
 * String newStatus = orchestrator.updateStatusCompat(订单ID, "submitted");
 * </pre>
 *
 * @author System
 * @since 2024-11-01
 * @see MaterialReconciliationService
 * @see ShipmentReconciliationService
 */
@Slf4j
@Service
public class ReconciliationStatusOrchestrator {

    private enum Scope {
        MATERIAL,
        SHIPMENT,
        AUTO
    }

    @Autowired
    private MaterialReconciliationService materialReconciliationService;

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired(required = false)
    private WebhookPushService webhookPushService;

    @Autowired(required = false)
    private BillAggregationOrchestrator billAggregationOrchestrator;

    @Autowired(required = false)
    private BillAggregationService billAggregationService;

    @Transactional(rollbackFor = Exception.class)
    public String updateMaterialStatus(String id, String status) {
        return updateStatus(Scope.MATERIAL, id, status);
    }

    @Transactional(rollbackFor = Exception.class)
    public String updateShipmentStatus(String id, String status) {
        return updateStatus(Scope.SHIPMENT, id, status);
    }

    @Transactional(rollbackFor = Exception.class)
    public String updateStatusCompat(String id, String status) {
        return updateStatus(Scope.AUTO, id, status);
    }

    @Transactional(rollbackFor = Exception.class)
    public String returnMaterialToPrevious(String id, String reason) {
        return returnToPrevious(Scope.MATERIAL, id, reason);
    }

    @Transactional(rollbackFor = Exception.class)
    public String returnShipmentToPrevious(String id, String reason) {
        return returnToPrevious(Scope.SHIPMENT, id, reason);
    }

    @Transactional(rollbackFor = Exception.class)
    public String returnCompat(String id, String reason) {
        return returnToPrevious(Scope.AUTO, id, reason);
    }

    private String updateStatus(Scope scope, String id, String status) {
        if (id == null || id.trim().isEmpty() || status == null || status.trim().isEmpty()) {
            throw new IllegalArgumentException("参数错误");
        }

        String rid = id.trim();
        String to = status.trim();
        LocalDateTime now = LocalDateTime.now();

        if (scope == Scope.MATERIAL || scope == Scope.AUTO) {
            MaterialReconciliation mr = materialReconciliationService.getById(rid);
            if (mr != null) {
                TenantAssert.assertBelongsToCurrentTenant(mr.getTenantId(), "物料对账单");
                guardTransition(mr.getStatus(), to);
                assertRejectPermission(to);
                String from = mr.getStatus() == null ? "" : mr.getStatus().trim();
                applyStatusAndTimestamps(mr::setStatus, mr::setUpdateTime, mr::setUpdateBy, mr::setCreateBy,
                        mr::setRemark, mr::setVerifiedAt, mr::setApprovedAt, mr::setPaidAt,
                        mr.getStatus(), to, mr.getRemark(), now);
                boolean ok = materialReconciliationService.updateById(mr);
                if (!ok) throw new IllegalStateException("状态更新失败");

                pushBillOnApproved(to, "MATERIAL_RECONCILIATION", rid, mr.getReconciliationNo(),
                        "PAYABLE", "MATERIAL", "SUPPLIER", mr.getSupplierId(), mr.getSupplierName(),
                        mr.getOrderId(), mr.getOrderNo(), mr.getFinalAmount(), mr.getTotalAmount(), now);
                cancelBillOnRejected(to, "MATERIAL_RECONCILIATION", rid, "物料对账");
                syncBillOnPaid(to, "MATERIAL_RECONCILIATION", rid, mr.getFinalAmount(), mr.getTotalAmount());
                return "状态更新成功";
            }
            if (scope == Scope.MATERIAL) {
                throw new NoSuchElementException("对账单不存在");
            }
        }

        if (scope == Scope.SHIPMENT || scope == Scope.AUTO) {
            ShipmentReconciliation sr = shipmentReconciliationService.getById(rid);
            if (sr != null) {
                TenantAssert.assertBelongsToCurrentTenant(sr.getTenantId(), "成品对账单");
                guardTransition(sr.getStatus(), to);
                assertRejectPermission(to);
                String from = sr.getStatus() == null ? "" : sr.getStatus().trim();
                applyStatusAndTimestamps(sr::setStatus, sr::setUpdateTime, sr::setUpdateBy, sr::setCreateBy,
                        sr::setRemark, sr::setVerifiedAt, sr::setApprovedAt, sr::setPaidAt,
                        sr.getStatus(), to, sr.getRemark(), now);
                boolean ok = shipmentReconciliationService.updateById(sr);
                if (!ok) throw new IllegalStateException("状态更新失败");

                pushBillOnApproved(to, "SHIPMENT_RECONCILIATION", rid, sr.getReconciliationNo(),
                        "RECEIVABLE", "PRODUCT", "CUSTOMER", sr.getCustomerId(), sr.getCustomerName(),
                        sr.getOrderId(), sr.getOrderNo(), sr.getFinalAmount(), sr.getTotalAmount(), now);
                cancelBillOnRejected(to, "SHIPMENT_RECONCILIATION", rid, "成品对账");
                syncBillOnPaid(to, "SHIPMENT_RECONCILIATION", rid, sr.getFinalAmount(), sr.getTotalAmount());
                pushWebhookOnShipmentApproved(to, rid, sr, from);
                return "状态更新成功";
            }
            if (scope == Scope.SHIPMENT) {
                throw new NoSuchElementException("对账单不存在");
            }
        }

        throw new NoSuchElementException("对账单不存在");
    }

    private void assertRejectPermission(String to) {
        if ("rejected".equals(to) && !UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("仅主管级别及以上可执行驳回");
        }
    }

    private void applyStatusAndTimestamps(
            java.util.function.Consumer<String> setStatus,
            java.util.function.Consumer<LocalDateTime> setUpdateTime,
            java.util.function.Consumer<String> setUpdateBy,
            java.util.function.Consumer<String> setCreateBy,
            java.util.function.Consumer<String> setRemark,
            java.util.function.Consumer<LocalDateTime> setVerifiedAt,
            java.util.function.Consumer<LocalDateTime> setApprovedAt,
            java.util.function.Consumer<LocalDateTime> setPaidAt,
            String currentStatus, String to, String currentRemark, LocalDateTime now) {

        String from = currentStatus == null ? "" : currentStatus.trim();
        setStatus.accept(to);
        setUpdateTime.accept(now);

        String uid = resolveCurrentUserId();
        if (uid != null) {
            setUpdateBy.accept(uid);
        }
        if (uid != null && (currentStatus == null || currentStatus.trim().isEmpty())) {
            setCreateBy.accept(uid);
        }
        if (!from.equals(to)) {
            setRemark.accept(appendAuditRemark(currentRemark, "STATUS", from + " -> " + to));
        }

        if ("rejected".equals(from) && "pending".equals(to)) {
            setVerifiedAt.accept(null);
            setApprovedAt.accept(null);
            setPaidAt.accept(null);
        }
        if ("verified".equals(to)) setVerifiedAt.accept(now);
        if ("approved".equals(to)) setApprovedAt.accept(now);
        if ("paid".equals(to)) setPaidAt.accept(now);
    }

    private String resolveCurrentUserId() {
        try {
            UserContext ctx = UserContext.get();
            String uid = ctx == null ? null : ctx.getUserId();
            return (uid == null || uid.trim().isEmpty()) ? null : uid.trim();
        } catch (Exception e) {
            log.warn("获取用户ID异常: {}", e.getMessage());
            return null;
        }
    }

    private void pushBillOnApproved(String to, String sourceType, String sourceId, String sourceNo,
            String billType, String billCategory, String counterpartyType, String counterpartyId,
            String counterpartyName, String orderId, String orderNo,
            BigDecimal finalAmount, BigDecimal totalAmount, LocalDateTime now) {
        if (!"approved".equals(to) || billAggregationOrchestrator == null) return;
        try {
            BillPushRequest pushReq = new BillPushRequest();
            pushReq.setBillType(billType);
            pushReq.setBillCategory(billCategory);
            pushReq.setSourceType(sourceType);
            pushReq.setSourceId(sourceId);
            pushReq.setSourceNo(sourceNo);
            pushReq.setCounterpartyType(counterpartyType);
            pushReq.setCounterpartyId(counterpartyId);
            pushReq.setCounterpartyName(counterpartyName);
            pushReq.setOrderId(orderId);
            pushReq.setOrderNo(orderNo);
            pushReq.setAmount(finalAmount != null ? finalAmount : totalAmount);
            pushReq.setSettlementMonth(now.format(DateTimeFormatter.ofPattern("yyyy-MM")));
            billAggregationOrchestrator.pushBill(pushReq);
        } catch (Exception e) {
            throw new RuntimeException(sourceType + "推送账单汇总失败，审批未完成: " + e.getMessage(), e);
        }
    }

    private void cancelBillOnRejected(String to, String sourceType, String sourceId, String label) {
        if (!"rejected".equals(to) || billAggregationOrchestrator == null) return;
        try {
            billAggregationOrchestrator.cancelBySource(sourceType, sourceId);
        } catch (Exception e) {
            log.warn("{}驳回联动取消账单失败（不影响主流程）: id={}", label, sourceId, e);
        }
    }

    private void syncBillOnPaid(String to, String sourceType, String sourceId,
            BigDecimal finalAmount, BigDecimal totalAmount) {
        if (!"paid".equals(to)) return;
        syncBillAsSettledBySource(sourceType, sourceId, finalAmount != null ? finalAmount : totalAmount);
    }

    private void pushWebhookOnShipmentApproved(String to, String rid, ShipmentReconciliation sr, String from) {
        if (!"approved".equals(to) || webhookPushService == null) return;
        try {
            BigDecimal amount = sr.getFinalAmount() != null ? sr.getFinalAmount() : BigDecimal.ZERO;
            String orderNo = sr.getOrderNo() != null ? sr.getOrderNo() : "";
            webhookPushService.pushReconciliationCreated(
                    orderNo, rid, amount, Map.of("status", "approved", "previousStatus", from));
        } catch (Exception e) {
            log.warn("Webhook推送对账审批通过失败: reconciliationId={}", rid, e);
        }
    }

    private void syncBillAsSettledBySource(String sourceType, String sourceId, BigDecimal amount) {
        if (billAggregationService == null || !StringUtils.hasText(sourceType) || !StringUtils.hasText(sourceId)) {
            return;
        }
        try {
            Long tenantId = TenantAssert.requireTenantId();
            BillAggregation bill = billAggregationService.lambdaQuery()
                    .eq(BillAggregation::getSourceType, sourceType)
                    .eq(BillAggregation::getSourceId, sourceId)
                    .eq(BillAggregation::getTenantId, tenantId)
                    .eq(BillAggregation::getDeleteFlag, 0)
                    .last("LIMIT 1")
                    .one();
            if (bill == null) {
                return;
            }
            BigDecimal settled = amount != null ? amount : bill.getAmount();
            if (settled == null) {
                settled = BigDecimal.ZERO;
            }
            if (bill.getAmount() != null && settled.compareTo(bill.getAmount()) > 0) {
                settled = bill.getAmount();
            }
            bill.setSettledAmount(settled);

            String currentStatus = bill.getStatus();
            if ("PENDING".equals(currentStatus)) {
                bill.setStatus("CONFIRMED");
            }
            if ("CONFIRMED".equals(bill.getStatus()) || "SETTLING".equals(currentStatus)) {
                if (settled.compareTo(bill.getAmount() != null ? bill.getAmount() : BigDecimal.ZERO) >= 0) {
                    bill.setStatus("SETTLED");
                } else {
                    bill.setStatus("SETTLING");
                }
            }

            bill.setSettledAt(LocalDateTime.now());
            bill.setSettledById(UserContext.userId());
            bill.setSettledByName(UserContext.username());
            billAggregationService.updateById(bill);
        } catch (Exception e) {
            log.warn("对账 paid 状态回写账单失败: sourceType={}, sourceId={}", sourceType, sourceId, e);
        }
    }

    private String returnToPrevious(Scope scope, String id, String reason) {
        if (id == null || id.trim().isEmpty()) {
            throw new IllegalArgumentException("参数错误");
        }
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("仅主管级别及以上可执行退回");
        }
        String rid = id.trim();

        if (scope == Scope.MATERIAL || scope == Scope.AUTO) {
            String result = tryReturnMaterial(rid, reason);
            if (result != null) return result;
            if (scope == Scope.MATERIAL) {
                throw new NoSuchElementException("对账单不存在");
            }
        }

        if (scope == Scope.SHIPMENT || scope == Scope.AUTO) {
            String result = tryReturnShipment(rid, reason);
            if (result != null) return result;
            if (scope == Scope.SHIPMENT) {
                throw new NoSuchElementException("对账单不存在");
            }
        }

        throw new NoSuchElementException("对账单不存在");
    }

    private String tryReturnMaterial(String rid, String reason) {
        MaterialReconciliation mr = materialReconciliationService.getById(rid);
        if (mr == null) return null;
        TenantAssert.assertBelongsToCurrentTenant(mr.getTenantId(), "物料对账单");
        String from = mr.getStatus();
        String to = previousStatus(mr.getStatus());
        if (to == null) {
            throw new IllegalStateException("当前状态不允许退回");
        }
        mr.setStatus(to);
        mr.setUpdateTime(LocalDateTime.now());
        mr.setRemark(appendAuditRemark(mr.getRemark(), "RETURN", reason));
        String uid = resolveCurrentUserId("物料");
        if (uid != null) {
            mr.setUpdateBy(uid);
            if (mr.getCreateBy() == null || mr.getCreateBy().trim().isEmpty()) {
                mr.setCreateBy(uid);
            }
        }
        applyReturnTimestampClear(mr, from, reason);
        LambdaUpdateWrapper<MaterialReconciliation> uw = buildMaterialReturnUpdate(mr, from, reason);
        boolean ok = materialReconciliationService.update(uw);
        if (!ok) throw new IllegalStateException("退回失败");
        return "退回成功";
    }

    private String tryReturnShipment(String rid, String reason) {
        ShipmentReconciliation sr = shipmentReconciliationService.getById(rid);
        if (sr == null) return null;
        TenantAssert.assertBelongsToCurrentTenant(sr.getTenantId(), "成品对账单");
        String from = sr.getStatus();
        String to = previousStatus(sr.getStatus());
        if (to == null) {
            throw new IllegalStateException("当前状态不允许退回");
        }
        sr.setStatus(to);
        sr.setUpdateTime(LocalDateTime.now());
        sr.setRemark(appendAuditRemark(sr.getRemark(), "RETURN", reason));
        String uid = resolveCurrentUserId("成品");
        if (uid != null) {
            sr.setUpdateBy(uid);
            if (sr.getCreateBy() == null || sr.getCreateBy().trim().isEmpty()) {
                sr.setCreateBy(uid);
            }
        }
        applyReturnTimestampClear(sr, from, reason);
        LambdaUpdateWrapper<ShipmentReconciliation> uw = buildShipmentReturnUpdate(sr, from, reason);
        boolean ok = shipmentReconciliationService.update(uw);
        if (!ok) throw new IllegalStateException("退回失败");
        return "退回成功";
    }

    private String resolveCurrentUserId(String label) {
        try {
            UserContext ctx = UserContext.get();
            String uid = ctx == null ? null : ctx.getUserId();
            return (uid == null || uid.trim().isEmpty()) ? null : uid.trim();
        } catch (Exception e) {
            log.warn("ReconciliationStatusOrchestrator.returnToPrevious 获取用户ID异常({}): {}", label, e.getMessage());
            return null;
        }
    }

    private void applyReturnTimestampClear(MaterialReconciliation mr, String from, String reason) {
        LocalDateTime now = LocalDateTime.now();
        if ("verified".equals(from)) mr.setVerifiedAt(null);
        else if ("approved".equals(from)) mr.setApprovedAt(null);
        else if ("paid".equals(from)) { mr.setPaidAt(null); mr.setReReviewAt(now); mr.setReReviewReason(reason); }
    }

    private void applyReturnTimestampClear(ShipmentReconciliation sr, String from, String reason) {
        LocalDateTime now = LocalDateTime.now();
        if ("verified".equals(from)) sr.setVerifiedAt(null);
        else if ("approved".equals(from)) sr.setApprovedAt(null);
        else if ("paid".equals(from)) { sr.setPaidAt(null); sr.setReReviewAt(now); sr.setReReviewReason(reason); }
    }

    private LambdaUpdateWrapper<MaterialReconciliation> buildMaterialReturnUpdate(MaterialReconciliation mr, String from, String reason) {
        LambdaUpdateWrapper<MaterialReconciliation> uw = new LambdaUpdateWrapper<>();
        uw.eq(MaterialReconciliation::getId, mr.getId())
            .set(MaterialReconciliation::getStatus, mr.getStatus())
            .set(MaterialReconciliation::getUpdateTime, mr.getUpdateTime())
            .set(MaterialReconciliation::getRemark, mr.getRemark())
            .set(MaterialReconciliation::getUpdateBy, mr.getUpdateBy())
            .set(MaterialReconciliation::getCreateBy, mr.getCreateBy());
        if ("verified".equals(from)) uw.set(MaterialReconciliation::getVerifiedAt, null);
        else if ("approved".equals(from)) uw.set(MaterialReconciliation::getApprovedAt, null);
        else if ("paid".equals(from)) {
            uw.set(MaterialReconciliation::getPaidAt, null)
              .set(MaterialReconciliation::getReReviewAt, LocalDateTime.now())
              .set(MaterialReconciliation::getReReviewReason, reason);
        }
        return uw;
    }

    private LambdaUpdateWrapper<ShipmentReconciliation> buildShipmentReturnUpdate(ShipmentReconciliation sr, String from, String reason) {
        LambdaUpdateWrapper<ShipmentReconciliation> uw = new LambdaUpdateWrapper<>();
        uw.eq(ShipmentReconciliation::getId, sr.getId())
            .set(ShipmentReconciliation::getStatus, sr.getStatus())
            .set(ShipmentReconciliation::getUpdateTime, sr.getUpdateTime())
            .set(ShipmentReconciliation::getRemark, sr.getRemark())
            .set(ShipmentReconciliation::getUpdateBy, sr.getUpdateBy())
            .set(ShipmentReconciliation::getCreateBy, sr.getCreateBy());
        if ("verified".equals(from)) uw.set(ShipmentReconciliation::getVerifiedAt, null);
        else if ("approved".equals(from)) uw.set(ShipmentReconciliation::getApprovedAt, null);
        else if ("paid".equals(from)) {
            uw.set(ShipmentReconciliation::getPaidAt, null)
              .set(ShipmentReconciliation::getReReviewAt, LocalDateTime.now())
              .set(ShipmentReconciliation::getReReviewReason, reason);
        }
        return uw;
    }


    private void guardTransition(String from, String to) {
        if (!isAllowedStatusTransition(from, to)) {
            if (isBackwardTransition(from, to)) {
                throw new IllegalStateException("不允许回退状态，请使用退回操作");
            }
            throw new IllegalStateException("不允许的状态流转");
        }
    }

    private boolean isAllowedStatusTransition(String from, String to) {
        if (to == null || to.isEmpty()) {
            return false;
        }
        if (from == null || from.isEmpty()) {
            return true;
        }
        if (from.equals(to)) {
            return true;
        }
        if ("rejected".equals(from)) {
            return "pending".equals(to);
        }
        if ("pending".equals(from)) {
            return "verified".equals(to) || "rejected".equals(to);
        }
        if ("verified".equals(from)) {
            return "approved".equals(to) || "rejected".equals(to);
        }
        if ("approved".equals(from)) {
            return "paid".equals(to) || "rejected".equals(to);
        }
        return false;
    }

    private boolean isBackwardTransition(String from, String to) {
        if (from == null || to == null) {
            return false;
        }
        int fromRank = statusRank(from);
        int toRank = statusRank(to);
        return toRank >= 0 && fromRank >= 0 && toRank < fromRank;
    }

    private int statusRank(String status) {
        if ("pending".equals(status)) {
            return 0;
        }
        if ("verified".equals(status)) {
            return 1;
        }
        if ("approved".equals(status)) {
            return 2;
        }
        if ("paid".equals(status)) {
            return 3;
        }
        if ("rejected".equals(status)) {
            return 99;
        }
        return -1;
    }

    private String previousStatus(String status) {
        if ("verified".equals(status)) {
            return "pending";
        }
        if ("approved".equals(status)) {
            return "verified";
        }
        if ("paid".equals(status)) {
            return "approved";
        }
        return null;
    }

    private String appendAuditRemark(String oldRemark, String action, String reason) {
        String ts = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        UserContext ctx = UserContext.get();
        String who = ctx == null ? "" : (ctx.getUsername() == null ? "" : ctx.getUsername());
        String r = reason == null ? "" : reason.trim();
        String line = "[" + ts + "]" + (who.isEmpty() ? "" : "[" + who + "]") + "[" + action + "]"
                + (r.isEmpty() ? "" : " " + r);
        if (oldRemark == null || oldRemark.trim().isEmpty()) {
            return line;
        }
        return oldRemark + "\n" + line;
    }
}
