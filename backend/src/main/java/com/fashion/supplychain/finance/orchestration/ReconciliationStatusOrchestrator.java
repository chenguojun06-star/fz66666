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
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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
                if ("rejected".equals(to) && !UserContext.isSupervisorOrAbove()) {
                    throw new AccessDeniedException("仅主管级别及以上可执行驳回");
                }
                String from = mr.getStatus() == null ? "" : mr.getStatus().trim();
                mr.setStatus(to);
                mr.setUpdateTime(now);
                String uid = null;
                try {
                    UserContext ctx = UserContext.get();
                    uid = ctx == null ? null : ctx.getUserId();
                    uid = (uid == null || uid.trim().isEmpty()) ? null : uid.trim();
                } catch (Exception e) {
                    log.warn("ReconciliationStatusOrchestrator.updateStatus 获取用户ID异常(物料): {}", e.getMessage());
                    uid = null;
                }
                if (uid != null) {
                    mr.setUpdateBy(uid);
                    if ((mr.getCreateBy() == null || mr.getCreateBy().trim().isEmpty())) {
                        mr.setCreateBy(uid);
                    }
                }

                if (!from.equals(to)) {
                    mr.setRemark(appendAuditRemark(mr.getRemark(), "STATUS", from + " -> " + to));
                }

                if ("rejected".equals(from) && "pending".equals(to)) {
                    mr.setVerifiedAt(null);
                    mr.setApprovedAt(null);
                    mr.setPaidAt(null);
                }
                if ("verified".equals(to) && mr.getVerifiedAt() == null) {
                    mr.setVerifiedAt(now);
                }
                if ("approved".equals(to) && mr.getApprovedAt() == null) {
                    mr.setApprovedAt(now);
                }
                if ("paid".equals(to)) {
                    mr.setPaidAt(now);
                }
                boolean ok = materialReconciliationService.updateById(mr);
                if (!ok) {
                    throw new IllegalStateException("状态更新失败");
                }

                if ("approved".equals(to) && billAggregationOrchestrator != null) {
                    try {
                        BillPushRequest pushReq = new BillPushRequest();
                        pushReq.setBillType("PAYABLE");
                        pushReq.setBillCategory("MATERIAL");
                        pushReq.setSourceType("MATERIAL_RECONCILIATION");
                        pushReq.setSourceId(rid);
                        pushReq.setSourceNo(mr.getReconciliationNo());
                        pushReq.setCounterpartyType("SUPPLIER");
                        pushReq.setCounterpartyId(mr.getSupplierId());
                        pushReq.setCounterpartyName(mr.getSupplierName());
                        pushReq.setOrderId(mr.getOrderId());
                        pushReq.setOrderNo(mr.getOrderNo());
                        pushReq.setAmount(mr.getFinalAmount() != null ? mr.getFinalAmount() : mr.getTotalAmount());
                        pushReq.setSettlementMonth(now.format(DateTimeFormatter.ofPattern("yyyy-MM")));
                        billAggregationOrchestrator.pushBill(pushReq);
                    } catch (Exception e) {
                        throw new RuntimeException("物料对账推送账单汇总失败，审批未完成: " + e.getMessage(), e);
                    }
                }
                if ("rejected".equals(to) && billAggregationOrchestrator != null) {
                    try {
                        billAggregationOrchestrator.cancelBySource("MATERIAL_RECONCILIATION", rid);
                    } catch (Exception e) {
                        log.warn("物料对账驳回联动取消账单失败（不影响主流程）: id={}", rid, e);
                    }
                }
                if ("paid".equals(to)) {
                    syncBillAsSettledBySource("MATERIAL_RECONCILIATION", rid,
                            mr.getFinalAmount() != null ? mr.getFinalAmount() : mr.getTotalAmount());
                }
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
                if ("rejected".equals(to) && !UserContext.isSupervisorOrAbove()) {
                    throw new AccessDeniedException("仅主管级别及以上可执行驳回");
                }
                String from = sr.getStatus() == null ? "" : sr.getStatus().trim();
                sr.setStatus(to);
                sr.setUpdateTime(now);
                String uid = null;
                try {
                    UserContext ctx = UserContext.get();
                    uid = ctx == null ? null : ctx.getUserId();
                    uid = (uid == null || uid.trim().isEmpty()) ? null : uid.trim();
                } catch (Exception e) {
                    log.warn("ReconciliationStatusOrchestrator.updateStatus 获取用户ID异常(成品): {}", e.getMessage());
                    uid = null;
                }
                if (uid != null) {
                    sr.setUpdateBy(uid);
                    if ((sr.getCreateBy() == null || sr.getCreateBy().trim().isEmpty())) {
                        sr.setCreateBy(uid);
                    }
                }
                if (!from.equals(to)) {
                    sr.setRemark(appendAuditRemark(sr.getRemark(), "STATUS", from + " -> " + to));
                }

                if ("rejected".equals(from) && "pending".equals(to)) {
                    sr.setVerifiedAt(null);
                    sr.setApprovedAt(null);
                    sr.setPaidAt(null);
                }
                if ("verified".equals(to) && sr.getVerifiedAt() == null) {
                    sr.setVerifiedAt(now);
                }
                if ("approved".equals(to) && sr.getApprovedAt() == null) {
                    sr.setApprovedAt(now);
                }
                if ("paid".equals(to)) {
                    sr.setPaidAt(now);
                }
                boolean ok = shipmentReconciliationService.updateById(sr);
                if (!ok) {
                    throw new IllegalStateException("状态更新失败");
                }

                if ("approved".equals(to) && billAggregationOrchestrator != null) {
                    try {
                        BillPushRequest pushReq = new BillPushRequest();
                        pushReq.setBillType("RECEIVABLE");
                        pushReq.setBillCategory("PRODUCT");
                        pushReq.setSourceType("SHIPMENT_RECONCILIATION");
                        pushReq.setSourceId(rid);
                        pushReq.setSourceNo(sr.getReconciliationNo());
                        pushReq.setCounterpartyType("CUSTOMER");
                        pushReq.setCounterpartyId(sr.getCustomerId());
                        pushReq.setCounterpartyName(sr.getCustomerName());
                        pushReq.setOrderId(sr.getOrderId());
                        pushReq.setOrderNo(sr.getOrderNo());
                        pushReq.setAmount(sr.getFinalAmount() != null ? sr.getFinalAmount() : sr.getTotalAmount());
                        pushReq.setSettlementMonth(now.format(DateTimeFormatter.ofPattern("yyyy-MM")));
                        billAggregationOrchestrator.pushBill(pushReq);
                    } catch (Exception e) {
                        throw new RuntimeException("成品对账推送账单汇总失败，审批未完成: " + e.getMessage(), e);
                    }
                }
                if ("rejected".equals(to) && billAggregationOrchestrator != null) {
                    try {
                        billAggregationOrchestrator.cancelBySource("SHIPMENT_RECONCILIATION", rid);
                    } catch (Exception e) {
                        log.warn("成品对账驳回联动取消账单失败（不影响主流程）: id={}", rid, e);
                    }
                }
                if ("paid".equals(to)) {
                    syncBillAsSettledBySource("SHIPMENT_RECONCILIATION", rid,
                            sr.getFinalAmount() != null ? sr.getFinalAmount() : sr.getTotalAmount());
                }

                if ("approved".equals(to)) {
                    if (webhookPushService != null) {
                        try {
                            BigDecimal amount = sr.getFinalAmount() != null ? sr.getFinalAmount() : BigDecimal.ZERO;
                            String orderNo = sr.getOrderNo() != null ? sr.getOrderNo() : "";
                            webhookPushService.pushReconciliationCreated(
                                orderNo, rid, amount,
                                Map.of("status", "approved", "previousStatus", from)
                            );
                        } catch (Exception e) {
                            log.warn("Webhook推送对账审批通过失败: reconciliationId={}", rid, e);
                        }
                    }
                }

                return "状态更新成功";
            }
            if (scope == Scope.SHIPMENT) {
                throw new NoSuchElementException("对账单不存在");
            }
        }

        throw new NoSuchElementException("对账单不存在");
    }

    private void syncBillAsSettledBySource(String sourceType, String sourceId, BigDecimal amount) {
        if (billAggregationService == null || !StringUtils.hasText(sourceType) || !StringUtils.hasText(sourceId)) {
            return;
        }
        try {
            Long tenantId = UserContext.tenantId();
            BillAggregation bill = billAggregationService.lambdaQuery()
                    .eq(BillAggregation::getSourceType, sourceType)
                    .eq(BillAggregation::getSourceId, sourceId)
                    .eq(tenantId != null, BillAggregation::getTenantId, tenantId)
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
        LocalDateTime now = LocalDateTime.now();

        if (scope == Scope.MATERIAL || scope == Scope.AUTO) {
            MaterialReconciliation mr = materialReconciliationService.getById(rid);
            if (mr != null) {
                TenantAssert.assertBelongsToCurrentTenant(mr.getTenantId(), "物料对账单");
                String from = mr.getStatus();
                String to = previousStatus(mr.getStatus());
                if (to == null) {
                    throw new IllegalStateException("当前状态不允许退回");
                }
                mr.setStatus(to);
                mr.setUpdateTime(now);
                mr.setRemark(appendAuditRemark(mr.getRemark(), "RETURN", reason));
                String uid = null;
                try {
                    UserContext ctx = UserContext.get();
                    uid = ctx == null ? null : ctx.getUserId();
                    uid = (uid == null || uid.trim().isEmpty()) ? null : uid.trim();
                } catch (Exception e) {
                    log.warn("ReconciliationStatusOrchestrator.returnToPrevious 获取用户ID异常(物料): {}", e.getMessage());
                    uid = null;
                }
                if (uid != null) {
                    mr.setUpdateBy(uid);
                    if ((mr.getCreateBy() == null || mr.getCreateBy().trim().isEmpty())) {
                        mr.setCreateBy(uid);
                    }
                }

                if ("verified".equals(from)) {
                    mr.setVerifiedAt(null);
                } else if ("approved".equals(from)) {
                    mr.setApprovedAt(null);
                } else if ("paid".equals(from)) {
                    mr.setPaidAt(null);
                }

                if ("paid".equals(from)) {
                    mr.setReReviewAt(now);
                    mr.setReReviewReason(reason);
                }
                // ⚠️ 用 LambdaUpdateWrapper 确保时间戳字段真正清空
                LambdaUpdateWrapper<MaterialReconciliation> mrUw = new LambdaUpdateWrapper<>();
                mrUw.eq(MaterialReconciliation::getId, mr.getId())
                    .set(MaterialReconciliation::getStatus, mr.getStatus())
                    .set(MaterialReconciliation::getUpdateTime, mr.getUpdateTime())
                    .set(MaterialReconciliation::getRemark, mr.getRemark())
                    .set(MaterialReconciliation::getUpdateBy, mr.getUpdateBy())
                    .set(MaterialReconciliation::getCreateBy, mr.getCreateBy());
                if ("verified".equals(from)) {
                    mrUw.set(MaterialReconciliation::getVerifiedAt, null);
                } else if ("approved".equals(from)) {
                    mrUw.set(MaterialReconciliation::getApprovedAt, null);
                } else if ("paid".equals(from)) {
                    mrUw.set(MaterialReconciliation::getPaidAt, null)
                        .set(MaterialReconciliation::getReReviewAt, now)
                        .set(MaterialReconciliation::getReReviewReason, reason);
                }
                boolean ok = materialReconciliationService.update(mrUw);
                if (!ok) {
                    throw new IllegalStateException("退回失败");
                }
                return "退回成功";
            }
            if (scope == Scope.MATERIAL) {
                throw new NoSuchElementException("对账单不存在");
            }
        }

        if (scope == Scope.SHIPMENT || scope == Scope.AUTO) {
            ShipmentReconciliation sr = shipmentReconciliationService.getById(rid);
            if (sr != null) {
                TenantAssert.assertBelongsToCurrentTenant(sr.getTenantId(), "成品对账单");
                String from = sr.getStatus();
                String to = previousStatus(sr.getStatus());
                if (to == null) {
                    throw new IllegalStateException("当前状态不允许退回");
                }
                sr.setStatus(to);
                sr.setUpdateTime(now);
                sr.setRemark(appendAuditRemark(sr.getRemark(), "RETURN", reason));
                String uid = null;
                try {
                    UserContext ctx = UserContext.get();
                    uid = ctx == null ? null : ctx.getUserId();
                    uid = (uid == null || uid.trim().isEmpty()) ? null : uid.trim();
                } catch (Exception e) {
                    log.warn("ReconciliationStatusOrchestrator.returnToPrevious 获取用户ID异常(成品): {}", e.getMessage());
                    uid = null;
                }
                if (uid != null) {
                    sr.setUpdateBy(uid);
                    if ((sr.getCreateBy() == null || sr.getCreateBy().trim().isEmpty())) {
                        sr.setCreateBy(uid);
                    }
                }

                if ("verified".equals(from)) {
                    sr.setVerifiedAt(null);
                } else if ("approved".equals(from)) {
                    sr.setApprovedAt(null);
                } else if ("paid".equals(from)) {
                    sr.setPaidAt(null);
                }

                if ("paid".equals(from)) {
                    sr.setReReviewAt(now);
                    sr.setReReviewReason(reason);
                }
                // ⚠️ 用 LambdaUpdateWrapper 确保时间戳字段真正清空
                LambdaUpdateWrapper<ShipmentReconciliation> srUw = new LambdaUpdateWrapper<>();
                srUw.eq(ShipmentReconciliation::getId, sr.getId())
                    .set(ShipmentReconciliation::getStatus, sr.getStatus())
                    .set(ShipmentReconciliation::getUpdateTime, sr.getUpdateTime())
                    .set(ShipmentReconciliation::getRemark, sr.getRemark())
                    .set(ShipmentReconciliation::getUpdateBy, sr.getUpdateBy())
                    .set(ShipmentReconciliation::getCreateBy, sr.getCreateBy());
                if ("verified".equals(from)) {
                    srUw.set(ShipmentReconciliation::getVerifiedAt, null);
                } else if ("approved".equals(from)) {
                    srUw.set(ShipmentReconciliation::getApprovedAt, null);
                } else if ("paid".equals(from)) {
                    srUw.set(ShipmentReconciliation::getPaidAt, null)
                        .set(ShipmentReconciliation::getReReviewAt, now)
                        .set(ShipmentReconciliation::getReReviewReason, reason);
                }
                boolean ok = shipmentReconciliationService.update(srUw);
                if (!ok) {
                    throw new IllegalStateException("退回失败");
                }
                return "退回成功";
            }
            if (scope == Scope.SHIPMENT) {
                throw new NoSuchElementException("对账单不存在");
            }
        }

        throw new NoSuchElementException("对账单不存在");
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
