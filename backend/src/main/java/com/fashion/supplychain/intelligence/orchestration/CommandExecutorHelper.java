package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.ExecutableCommand;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import com.fashion.supplychain.finance.service.FinishedProductSettlementService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 命令执行辅助类 — 从 ExecutionEngineOrchestrator 抽取的 13 种命令执行 + 快照撤回。
 * Orchestrator 仅保留入口调度、审计、级联、通知逻辑。
 */
@Component
@Slf4j
public class CommandExecutorHelper {

    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private MaterialStockService materialStockService;
    @Autowired private StyleInfoService styleInfoService;
    @Autowired private FinishedProductSettlementService finishedProductSettlementService;
    @Autowired private MaterialPurchaseService materialPurchaseService;
    @Autowired private SmartNotificationOrchestrator smartNotification;

    private static final int MAX_UNDO_ENTRIES = 500;
    private final ConcurrentHashMap<Long, UndoSnapshot> undoSnapshots = new ConcurrentHashMap<>();

    // ── 内部快照记录 ──

    private static class UndoSnapshot {
        final String commandId;
        final String action;
        final String targetId;
        final Map<String, Object> originalValues;
        final LocalDateTime createdAt;

        UndoSnapshot(String commandId, String action, String targetId, Map<String, Object> originalValues) {
            this.commandId = commandId;
            this.action = action;
            this.targetId = targetId;
            this.originalValues = originalValues;
            this.createdAt = LocalDateTime.now();
        }
    }

    // ── 13 种命令执行 ──

    public ProductionOrder executeOrderHold(ExecutableCommand command, Long executorId) {
        ProductionOrder order = requireOrder(command.getTargetId());
        String status = order.getStatus();
        if ("completed".equals(status) || "cancelled".equals(status)) {
            throw new ExecutionEngineOrchestrator.BusinessException("订单状态 " + status + " 不允许暂停");
        }
        order.setStatus("delayed");
        order.setOperationRemark((String) command.getParams().getOrDefault("holdReason",
            "由AI自动暂停: " + command.getReason()));
        productionOrderService.updateById(order);
        log.info("[OrderPause] 订单已暂停: orderId={}, executor={}", command.getTargetId(), executorId);
        return order;
    }

    public ProductionOrder executeOrderExpedite(ExecutableCommand command, Long executorId) {
        ProductionOrder order = requireOrder(command.getTargetId());
        order.setUrgencyLevel("URGENT");
        productionOrderService.updateById(order);
        log.info("[OrderExpedite] 订单已加快: orderId={}, executor={}", command.getTargetId(), executorId);
        return order;
    }

    public ProductionOrder executeOrderResume(ExecutableCommand command, Long executorId) {
        ProductionOrder order = requireOrder(command.getTargetId());
        if (!"delayed".equals(order.getStatus())) {
            throw new ExecutionEngineOrchestrator.BusinessException(
                "订单当前状态为 " + order.getStatus() + "，不支持恢复（仅 delayed 状态可恢复）");
        }
        order.setStatus("production");
        order.setOperationRemark(null);
        productionOrderService.updateById(order);
        log.info("[OrderResume] 订单已恢复: orderId={}, executor={}", command.getTargetId(), executorId);
        return order;
    }

    public ProductionOrder executeOrderRemark(ExecutableCommand command, Long executorId) {
        ProductionOrder order = requireOrder(command.getTargetId());
        String remark = (String) command.getParams().getOrDefault("remark", command.getReason());
        String existing = order.getOperationRemark();
        order.setOperationRemark((existing != null && !existing.isBlank() ? existing + "\n" : "") + "[AI] " + remark);
        productionOrderService.updateById(order);
        log.info("[OrderRemark] 备注已添加: orderId={}, executor={}", command.getTargetId(), executorId);
        return order;
    }

    public Map<String, Object> executeMaterialSafetyStock(ExecutableCommand command, Long executorId) {
        String stockId = command.getTargetId();
        Object thresholdObj = command.getParams().get("safetyStock");
        if (thresholdObj == null) {
            throw new ExecutionEngineOrchestrator.BusinessException("缺少 safetyStock 参数");
        }
        int newThreshold = Integer.parseInt(thresholdObj.toString());
        if (newThreshold < 0) {
            throw new ExecutionEngineOrchestrator.BusinessException("安全库存不能为负数");
        }
        boolean ok = materialStockService.updateSafetyStock(stockId, newThreshold);
        if (!ok) {
            throw new ExecutionEngineOrchestrator.BusinessException("库存记录不存在或更新失败: " + stockId);
        }
        log.info("[MaterialSafetyStock] 安全库存已更新: stockId={}, newThreshold={}, executor={}", stockId, newThreshold, executorId);
        return Map.of("stockId", stockId, "newSafetyStock", newThreshold);
    }

    public Map<String, Object> executeNotificationPush(ExecutableCommand command, Long executorId) {
        var resp = smartNotification.generateNotifications();
        int count = resp.getNotifications() != null ? resp.getNotifications().size() : 0;
        log.info("[NotificationPush] 推送通知: count={}, pending={}, executor={}", count, resp.getPendingCount(), executorId);
        return Map.of("notificationCount", count, "pendingCount", resp.getPendingCount());
    }

    public ProductionOrder executeOrderApprove(ExecutableCommand command, Long executorId) {
        ProductionOrder order = requireOrder(command.getTargetId());
        if (!"pending".equals(order.getStatus())) {
            throw new ExecutionEngineOrchestrator.BusinessException(
                "仅待生产(pending)状态的订单可以审核通过，当前状态: " + order.getStatus());
        }
        order.setStatus("production");
        order.setOperationRemark("[AI审核] 已审核通过: " + command.getReason());
        productionOrderService.updateById(order);
        log.info("[OrderApprove] 订单审核通过: orderId={}, executor={}", command.getTargetId(), executorId);
        return order;
    }

    public ProductionOrder executeOrderReject(ExecutableCommand command, Long executorId) {
        ProductionOrder order = requireOrder(command.getTargetId());
        String status = order.getStatus();
        if ("completed".equals(status) || "cancelled".equals(status)) {
            throw new ExecutionEngineOrchestrator.BusinessException(
                "已完成/已取消的订单不能退回，当前状态: " + status);
        }
        String rejectReason = (String) command.getParams().getOrDefault("rejectReason", command.getReason());
        order.setStatus("pending");
        order.setOperationRemark("[AI退回] " + rejectReason);
        productionOrderService.updateById(order);
        log.info("[OrderReject] 订单已退回: orderId={}, reason={}, executor={}", command.getTargetId(), rejectReason, executorId);
        return order;
    }

    public StyleInfo executeStyleApprove(ExecutableCommand command, Long executorId) {
        String styleId = command.getTargetId();
        StyleInfo style = styleInfoService.getById(styleId);
        if (style == null) {
            throw new ExecutionEngineOrchestrator.BusinessException("款式不存在: " + styleId);
        }
        style.setSampleReviewStatus("PASS");
        style.setSampleReviewComment("[AI审核] " + command.getReason());
        style.setSampleReviewTime(LocalDateTime.now());
        styleInfoService.updateById(style);
        log.info("[StyleApprove] 款式审核通过: styleId={}, executor={}", styleId, executorId);
        return style;
    }

    public StyleInfo executeStyleReturn(ExecutableCommand command, Long executorId) {
        String styleId = command.getTargetId();
        StyleInfo style = styleInfoService.getById(styleId);
        if (style == null) {
            throw new ExecutionEngineOrchestrator.BusinessException("款式不存在: " + styleId);
        }
        String returnReason = (String) command.getParams().getOrDefault("returnReason", command.getReason());
        style.setSampleReviewStatus("REWORK");
        style.setSampleReviewComment("[AI退回] " + returnReason);
        style.setSampleReviewTime(LocalDateTime.now());
        styleInfoService.updateById(style);
        log.info("[StyleReturn] 款式已退回: styleId={}, reason={}, executor={}", styleId, returnReason, executorId);
        return style;
    }

    public ProductionOrder executeQualityReject(ExecutableCommand command, Long executorId) {
        ProductionOrder order = requireOrder(command.getTargetId());
        String rejectReason = (String) command.getParams().getOrDefault("qualityIssue", command.getReason());
        order.setOperationRemark("[AI质检退回] " + rejectReason);
        productionOrderService.updateById(order);
        log.info("[QualityReject] 质检退回: orderId={}, reason={}, executor={}", command.getTargetId(), rejectReason, executorId);
        return order;
    }

    public FinishedProductSettlement executeSettlementApprove(ExecutableCommand command, Long executorId) {
        String settlementId = command.getTargetId();
        FinishedProductSettlement settlement = finishedProductSettlementService.getById(settlementId);
        if (settlement == null) {
            throw new ExecutionEngineOrchestrator.BusinessException("结算单不存在: " + settlementId);
        }
        if ("approved".equals(settlement.getStatus())) {
            throw new ExecutionEngineOrchestrator.BusinessException("结算单已审批，无需重复操作");
        }
        settlement.setStatus("approved");
        finishedProductSettlementService.updateById(settlement);
        log.info("[SettlementApprove] 结算审批通过: settlementId={}, executor={}", settlementId, executorId);
        return settlement;
    }

    public MaterialPurchase executePurchaseCreate(ExecutableCommand command, Long executorId) {
        Map<String, Object> params = command.getParams();
        String materialName = (String) params.getOrDefault("materialName", "");
        Object qtyObj = params.get("quantity");
        if (qtyObj == null || materialName.isBlank()) {
            throw new ExecutionEngineOrchestrator.BusinessException("缺少必要参数: materialName 和 quantity");
        }
        int quantity = Integer.parseInt(qtyObj.toString());
        if (quantity <= 0) {
            throw new ExecutionEngineOrchestrator.BusinessException("采购数量必须为正数");
        }
        MaterialPurchase purchase = new MaterialPurchase();
        purchase.setMaterialName(materialName);
        purchase.setPurchaseQuantity(quantity);
        purchase.setSourceType("AI");
        purchase.setRemark("[AI创建] " + command.getReason());
        purchase.setStatus("pending");
        materialPurchaseService.save(purchase);
        log.info("[PurchaseCreate] AI创建采购单: materialName={}, qty={}, executor={}", materialName, quantity, executorId);
        return purchase;
    }

    // ── 快照 & 撤回 ──

    public void takePreExecutionSnapshot(ExecutableCommand command, Long executorId) {
        try {
            Map<String, Object> original = new LinkedHashMap<>();
            String targetId = command.getTargetId();
            switch (command.getAction()) {
                case "order:hold", "order:expedite", "order:resume", "order:approve",
                     "order:reject", "order:remark", "quality:reject" -> {
                    ProductionOrder o = productionOrderService.getByOrderNo(targetId);
                    if (o != null) {
                        original.put("status", o.getStatus());
                        original.put("urgencyLevel", o.getUrgencyLevel());
                        original.put("operationRemark", o.getOperationRemark());
                    }
                }
                case "style:approve", "style:return" -> {
                    StyleInfo s = styleInfoService.getById(targetId);
                    if (s != null) {
                        original.put("sampleReviewStatus", s.getSampleReviewStatus());
                        original.put("sampleReviewComment", s.getSampleReviewComment());
                    }
                }
                case "settlement:approve" -> {
                    FinishedProductSettlement st = finishedProductSettlementService.getById(targetId);
                    if (st != null) original.put("status", st.getStatus());
                }
                default -> { /* material/notification/purchase 等不支持撤回 */ }
            }
            if (!original.isEmpty()) {
                if (undoSnapshots.size() > MAX_UNDO_ENTRIES) undoSnapshots.clear();
                undoSnapshots.put(executorId, new UndoSnapshot(
                    command.getCommandId(), command.getAction(), targetId, original));
            }
        } catch (Exception e) {
            log.warn("[Undo] 快照保存失败，不影响主流程: {}", e.getMessage());
        }
    }

    public Map<String, Object> executeUndoLast(Long executorId) {
        UndoSnapshot snap = undoSnapshots.remove(executorId);
        if (snap == null) {
            throw new ExecutionEngineOrchestrator.BusinessException("没有可撤回的操作");
        }
        if (snap.createdAt.plusMinutes(10).isBefore(LocalDateTime.now())) {
            throw new ExecutionEngineOrchestrator.BusinessException("操作已超过10分钟，无法撤回");
        }
        switch (snap.action) {
            case "order:hold", "order:expedite", "order:resume", "order:approve",
                 "order:reject", "order:remark", "quality:reject" -> {
                ProductionOrder o = productionOrderService.getByOrderNo(snap.targetId);
                if (o == null) throw new ExecutionEngineOrchestrator.BusinessException("订单已被删除，无法撤回");
                o.setStatus((String) snap.originalValues.get("status"));
                o.setUrgencyLevel((String) snap.originalValues.get("urgencyLevel"));
                o.setOperationRemark((String) snap.originalValues.get("operationRemark"));
                productionOrderService.updateById(o);
            }
            case "style:approve", "style:return" -> {
                StyleInfo s = styleInfoService.getById(snap.targetId);
                if (s == null) throw new ExecutionEngineOrchestrator.BusinessException("款式已被删除，无法撤回");
                s.setSampleReviewStatus((String) snap.originalValues.get("sampleReviewStatus"));
                s.setSampleReviewComment((String) snap.originalValues.get("sampleReviewComment"));
                styleInfoService.updateById(s);
            }
            case "settlement:approve" -> {
                FinishedProductSettlement st = finishedProductSettlementService.getById(snap.targetId);
                if (st == null) throw new ExecutionEngineOrchestrator.BusinessException("结算单已被删除，无法撤回");
                st.setStatus((String) snap.originalValues.get("status"));
                finishedProductSettlementService.updateById(st);
            }
            default -> throw new ExecutionEngineOrchestrator.BusinessException("该类型操作不支持撤回: " + snap.action);
        }
        log.info("[Undo] 已撤回操作: action={}, target={}, executor={}", snap.action, snap.targetId, executorId);
        return Map.of("undoneAction", snap.action, "targetId", snap.targetId, "commandId", snap.commandId);
    }

    // ── 工具方法 ──

    private ProductionOrder requireOrder(String orderId) {
        ProductionOrder order = productionOrderService.getByOrderNo(orderId);
        if (order == null) {
            throw new ExecutionEngineOrchestrator.BusinessException("订单不存在: " + orderId);
        }
        return order;
    }
}
