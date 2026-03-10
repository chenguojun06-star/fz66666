package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.ExecutableCommand;
import com.fashion.supplychain.intelligence.dto.ExecutionResult;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import com.fashion.supplychain.finance.service.FinishedProductSettlementService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.LinkedHashMap;


/**
 * 执行引擎编排器（核心）
 *
 * 职责：
 *   1. 真正执行命令，改数据库
 *   2. 确保所有变更在一个事务内
 *   3. 记录审计信息
 *   4. 触发后续工作流（级联）
 *   5. 发送通知
 *
 * 关键设计：
 *   ├─ 每个命令对应一个 execute 方法
 *   ├─ 使用 @Transactional 确保原子性
 *   ├─ 业务异常直接抛出，由外层统一处理
 *   ├─ 成功后立即触发级联流程
 *   └─ 记录完整审计日志
 *
 * @author Execution Engine v1.0
 * @date 2026-03-08
 */
@Slf4j
@Service
public class ExecutionEngineOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private FinishedProductSettlementService finishedProductSettlementService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private AuditTrailOrchestrator auditTrail;

    @Autowired
    private SmartNotificationOrchestrator smartNotification;

    @Autowired
    private SmartWorkflowOrchestrator smartWorkflow;

    // ── 撤回快照存储（executorId → 最近一次命令快照） ──
    private final ConcurrentHashMap<Long, UndoSnapshot> undoSnapshots = new ConcurrentHashMap<>();
    private static final int MAX_UNDO_ENTRIES = 500;

    /** 撤回快照 */
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

    /**
     * 执行命令的主入口
     *
     * @param command 要执行的命令
     * @param executorId 执行者ID
     * @return 执行结果
     */
    @Transactional(rollbackFor = Exception.class)
    public <T> ExecutionResult<T> execute(
        ExecutableCommand command,
        Long executorId
    ) {
        long startTime = System.currentTimeMillis();
        String auditId = command.getCommandId();

        try {
            log.info("[ExecutionEngine] 开始执行命令: action={}, commandId={}, executor={}",
                command.getAction(), command.getCommandId(), executorId);

            // 1. 记录审计 - 开始
            auditTrail.logCommandStart(command, executorId);

            // 2. 根据命令类型分发执行
            Object result = null;
            // 撤回命令特殊处理（不保存快照）
            if ("undo:last".equals(command.getAction())) {
                result = executeUndoLast(executorId);
            } else {
                // 保存快照供撤回
                takePreExecutionSnapshot(command, executorId);

                switch (command.getAction()) {
                case "order:hold" -> {
                    result = executeOrderHold(command, executorId);
                }
                case "order:expedite" -> {
                    result = executeOrderExpedite(command, executorId);
                }
                case "order:resume" -> {
                    result = executeOrderResume(command, executorId);
                }
                case "order:remark" -> {
                    result = executeOrderRemark(command, executorId);
                }
                case "material:safety_stock" -> {
                    result = executeMaterialSafetyStock(command, executorId);
                }
                case "notification:push" -> {
                    result = executeNotificationPush(command, executorId);
                }
                case "order:approve" -> {
                    result = executeOrderApprove(command, executorId);
                }
                case "order:reject" -> {
                    result = executeOrderReject(command, executorId);
                }
                case "style:approve" -> {
                    result = executeStyleApprove(command, executorId);
                }
                case "style:return" -> {
                    result = executeStyleReturn(command, executorId);
                }
                case "quality:reject" -> {
                    result = executeQualityReject(command, executorId);
                }
                case "settlement:approve" -> {
                    result = executeSettlementApprove(command, executorId);
                }
                case "purchase:create" -> {
                    result = executePurchaseCreate(command, executorId);
                }
                default -> {
                    throw new IllegalArgumentException("未知的命令类型: " + command.getAction());
                }
                }
            } // end if (not undo)

            // 3. 成功：记录审计
            long duration = System.currentTimeMillis() - startTime;
            auditTrail.logCommandSuccess(command, result, executorId, duration);

            // 4. 触发后续工作流（级联）
            int cascadedCount = triggerPostExecutionWorkflow(command, result, executorId);

            // 5. 发送通知
            String notificationMsg = generateNotificationMessage(command, result);

            log.info("[ExecutionEngine] 命令执行成功: action={}, commandId={}, duration={}ms, cascaded={}",
                command.getAction(), command.getCommandId(), duration, cascadedCount);

            return (ExecutionResult<T>) ExecutionResult.success(result, notificationMsg);

        } catch (BusinessException e) {
            long duration = System.currentTimeMillis() - startTime;
            auditTrail.logCommandFailure(command, e, executorId, duration);
            log.error("[ExecutionEngine] 业务异常: action={}, commandId={}, error={}",
                command.getAction(), command.getCommandId(), e.getMessage());
            return (ExecutionResult<T>) ExecutionResult.failure(e.getMessage());

        } catch (Exception e) {
            long duration = System.currentTimeMillis() - startTime;
            auditTrail.logCommandFailure(command, e, executorId, duration);
            log.error("[ExecutionEngine] 系统异常: action={}, commandId={}",
                command.getAction(), command.getCommandId(), e);
            return (ExecutionResult<T>) ExecutionResult.failure("系统异常: " + e.getMessage());
        }
    }

    /**
     * 执行命令：暂停订单
     */
    private ProductionOrder executeOrderHold(ExecutableCommand command, Long executorId) {
        String orderId = command.getTargetId();
        ProductionOrder order = productionOrderService.getByOrderNo(orderId);

        if (order == null) {
            throw new BusinessException("订单不存在: " + orderId);
        }

        // 检查状态是否允许暂停
        String status = order.getStatus();
        if ("completed".equals(status) || "cancelled".equals(status)) {
            throw new BusinessException("订单状态 " + status + " 不允许暂停");
        }

// 执行改状态：暂停 = delayed（系统内建延期状态，避免写入非法 HOLD）
        order.setStatus("delayed");
        order.setOperationRemark((String) command.getParams().getOrDefault("holdReason",
            "由AI自动暂停: " + command.getReason()));

        productionOrderService.updateById(order);

        log.info("[OrderPause] 订单已暂停: orderId={}, executor={}", orderId, executorId);
        return order;
    }

    /**
     * 执行命令：加快订单
     */
    private ProductionOrder executeOrderExpedite(ExecutableCommand command, Long executorId) {
        String orderId = command.getTargetId();
        ProductionOrder order = productionOrderService.getByOrderNo(orderId);

        if (order == null) {
            throw new BusinessException("订单不存在: " + orderId);
        }

        // 标记为加快状态
        order.setUrgencyLevel("URGENT");

        productionOrderService.updateById(order);

        log.info("[OrderExpedite] 订单已加快: orderId={}, executor={}", orderId, executorId);
        return order;
    }

    /**
     * 执行命令：恢复订单
     */
    private ProductionOrder executeOrderResume(ExecutableCommand command, Long executorId) {
        String orderId = command.getTargetId();
        ProductionOrder order = productionOrderService.getByOrderNo(orderId);

        if (order == null) {
            throw new BusinessException("订单不存在: " + orderId);
        }

        // 检查是否处于暂停状态（delayed 是 AI 暂停的标识状态）
        if (!"delayed".equals(order.getStatus())) {
            throw new BusinessException("订单当前状态为 " + order.getStatus() + "，不支持恢复（仅 delayed 状态可恢复）");
        }

        // 恢复状态
        order.setStatus("production");
        order.setOperationRemark(null);

        productionOrderService.updateById(order);

        log.info("[OrderResume] 订单已恢复: orderId={}, executor={}", orderId, executorId);
        return order;
    }

    /**
     * 执行命令：添加订单备注
     */
    private ProductionOrder executeOrderRemark(ExecutableCommand command, Long executorId) {
        String orderId = command.getTargetId();
        ProductionOrder order = productionOrderService.getByOrderNo(orderId);
        if (order == null) {
            throw new BusinessException("订单不存在: " + orderId);
        }
        String remark = (String) command.getParams().getOrDefault("remark", command.getReason());
        String existing = order.getOperationRemark();
        order.setOperationRemark((existing != null && !existing.isBlank() ? existing + "\n" : "") + "[AI] " + remark);
        productionOrderService.updateById(order);
        log.info("[OrderRemark] 备注已添加: orderId={}, executor={}", orderId, executorId);
        return order;
    }

    /**
     * 执行命令：调整物料安全库存阈值
     */
    private java.util.Map<String, Object> executeMaterialSafetyStock(ExecutableCommand command, Long executorId) {
        String stockId = command.getTargetId();
        Object thresholdObj = command.getParams().get("safetyStock");
        if (thresholdObj == null) {
            throw new BusinessException("缺少 safetyStock 参数");
        }
        int newThreshold = Integer.parseInt(thresholdObj.toString());
        if (newThreshold < 0) {
            throw new BusinessException("安全库存不能为负数");
        }
        boolean ok = materialStockService.updateSafetyStock(stockId, newThreshold);
        if (!ok) {
            throw new BusinessException("库存记录不存在或更新失败: " + stockId);
        }
        log.info("[MaterialSafetyStock] 安全库存已更新: stockId={}, newThreshold={}, executor={}", stockId, newThreshold, executorId);
        return java.util.Map.of("stockId", stockId, "newSafetyStock", newThreshold);
    }

    /**
     * 执行命令：推送智能通知
     */
    private java.util.Map<String, Object> executeNotificationPush(ExecutableCommand command, Long executorId) {
        // 触发智能通知生成
        var resp = smartNotification.generateNotifications();
        int count = resp.getNotifications() != null ? resp.getNotifications().size() : 0;
        log.info("[NotificationPush] 推送通知: count={}, pending={}, executor={}", count, resp.getPendingCount(), executorId);
        return java.util.Map.of("notificationCount", count, "pendingCount", resp.getPendingCount());
    }

    /**
     * 执行命令：审核通过生产订单
     */
    private ProductionOrder executeOrderApprove(ExecutableCommand command, Long executorId) {
        String orderId = command.getTargetId();
        ProductionOrder order = productionOrderService.getByOrderNo(orderId);
        if (order == null) {
            throw new BusinessException("订单不存在: " + orderId);
        }
        String status = order.getStatus();
        if (!"pending".equals(status)) {
            throw new BusinessException("仅待生产(pending)状态的订单可以审核通过，当前状态: " + status);
        }
        order.setStatus("production");
        order.setOperationRemark("[AI审核] 已审核通过: " + command.getReason());
        productionOrderService.updateById(order);
        log.info("[OrderApprove] 订单审核通过: orderId={}, executor={}", orderId, executorId);
        return order;
    }

    /**
     * 执行命令：退回生产订单
     */
    private ProductionOrder executeOrderReject(ExecutableCommand command, Long executorId) {
        String orderId = command.getTargetId();
        ProductionOrder order = productionOrderService.getByOrderNo(orderId);
        if (order == null) {
            throw new BusinessException("订单不存在: " + orderId);
        }
        String status = order.getStatus();
        if ("completed".equals(status) || "cancelled".equals(status)) {
            throw new BusinessException("已完成/已取消的订单不能退回，当前状态: " + status);
        }
        String rejectReason = (String) command.getParams().getOrDefault("rejectReason", command.getReason());
        order.setStatus("pending");
        order.setOperationRemark("[AI退回] " + rejectReason);
        productionOrderService.updateById(order);
        log.info("[OrderReject] 订单已退回: orderId={}, reason={}, executor={}", orderId, rejectReason, executorId);
        return order;
    }

    /**
     * 执行命令：款式开发审核通过
     */
    private StyleInfo executeStyleApprove(ExecutableCommand command, Long executorId) {
        String styleId = command.getTargetId();
        StyleInfo style = styleInfoService.getById(styleId);
        if (style == null) {
            throw new BusinessException("款式不存在: " + styleId);
        }
        style.setSampleReviewStatus("PASS");
        style.setSampleReviewComment("[AI审核] " + command.getReason());
        style.setSampleReviewTime(LocalDateTime.now());
        styleInfoService.updateById(style);
        log.info("[StyleApprove] 款式审核通过: styleId={}, executor={}", styleId, executorId);
        return style;
    }

    /**
     * 执行命令：退回款式重新开发
     */
    private StyleInfo executeStyleReturn(ExecutableCommand command, Long executorId) {
        String styleId = command.getTargetId();
        StyleInfo style = styleInfoService.getById(styleId);
        if (style == null) {
            throw new BusinessException("款式不存在: " + styleId);
        }
        String returnReason = (String) command.getParams().getOrDefault("returnReason", command.getReason());
        style.setSampleReviewStatus("REWORK");
        style.setSampleReviewComment("[AI退回] " + returnReason);
        style.setSampleReviewTime(LocalDateTime.now());
        styleInfoService.updateById(style);
        log.info("[StyleReturn] 款式已退回: styleId={}, reason={}, executor={}", styleId, returnReason, executorId);
        return style;
    }

    /**
     * 执行命令：质检不合格退回
     */
    private ProductionOrder executeQualityReject(ExecutableCommand command, Long executorId) {
        String orderId = command.getTargetId();
        ProductionOrder order = productionOrderService.getByOrderNo(orderId);
        if (order == null) {
            throw new BusinessException("订单不存在: " + orderId);
        }
        String rejectReason = (String) command.getParams().getOrDefault("qualityIssue", command.getReason());
        order.setOperationRemark("[AI质检退回] " + rejectReason);
        productionOrderService.updateById(order);
        log.info("[QualityReject] 质检退回: orderId={}, reason={}, executor={}", orderId, rejectReason, executorId);
        return order;
    }

    /**
     * 执行命令：工资对账审批通过
     */
    private FinishedProductSettlement executeSettlementApprove(ExecutableCommand command, Long executorId) {
        String settlementId = command.getTargetId();
        FinishedProductSettlement settlement = finishedProductSettlementService.getById(settlementId);
        if (settlement == null) {
            throw new BusinessException("结算单不存在: " + settlementId);
        }
        String status = settlement.getStatus();
        if ("approved".equals(status)) {
            throw new BusinessException("结算单已审批，无需重复操作");
        }
        settlement.setStatus("approved");
        finishedProductSettlementService.updateById(settlement);
        log.info("[SettlementApprove] 结算审批通过: settlementId={}, executor={}", settlementId, executorId);
        return settlement;
    }

    /**
     * 执行命令：AI自动创建采购单
     */
    private MaterialPurchase executePurchaseCreate(ExecutableCommand command, Long executorId) {
        Map<String, Object> params = command.getParams();
        String materialName = (String) params.getOrDefault("materialName", "");
        Object qtyObj = params.get("quantity");
        if (qtyObj == null || materialName.isBlank()) {
            throw new BusinessException("缺少必要参数: materialName 和 quantity");
        }
        int quantity = Integer.parseInt(qtyObj.toString());
        if (quantity <= 0) {
            throw new BusinessException("采购数量必须为正数");
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

    private void takePreExecutionSnapshot(ExecutableCommand command, Long executorId) {
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

    private Map<String, Object> executeUndoLast(Long executorId) {
        UndoSnapshot snap = undoSnapshots.remove(executorId);
        if (snap == null) {
            throw new BusinessException("没有可撤回的操作");
        }
        // 检查过期（10分钟内可撤回）
        if (snap.createdAt.plusMinutes(10).isBefore(LocalDateTime.now())) {
            throw new BusinessException("操作已超过10分钟，无法撤回");
        }

        switch (snap.action) {
            case "order:hold", "order:expedite", "order:resume", "order:approve",
                 "order:reject", "order:remark", "quality:reject" -> {
                ProductionOrder o = productionOrderService.getByOrderNo(snap.targetId);
                if (o == null) throw new BusinessException("订单已被删除，无法撤回");
                o.setStatus((String) snap.originalValues.get("status"));
                o.setUrgencyLevel((String) snap.originalValues.get("urgencyLevel"));
                o.setOperationRemark((String) snap.originalValues.get("operationRemark"));
                productionOrderService.updateById(o);
            }
            case "style:approve", "style:return" -> {
                StyleInfo s = styleInfoService.getById(snap.targetId);
                if (s == null) throw new BusinessException("款式已被删除，无法撤回");
                s.setSampleReviewStatus((String) snap.originalValues.get("sampleReviewStatus"));
                s.setSampleReviewComment((String) snap.originalValues.get("sampleReviewComment"));
                styleInfoService.updateById(s);
            }
            case "settlement:approve" -> {
                FinishedProductSettlement st = finishedProductSettlementService.getById(snap.targetId);
                if (st == null) throw new BusinessException("结算单已被删除，无法撤回");
                st.setStatus((String) snap.originalValues.get("status"));
                finishedProductSettlementService.updateById(st);
            }
            default -> throw new BusinessException("该类型操作不支持撤回: " + snap.action);
        }

        log.info("[Undo] 已撤回操作: action={}, target={}, executor={}", snap.action, snap.targetId, executorId);
        return Map.of("undoneAction", snap.action, "targetId", snap.targetId, "commandId", snap.commandId);
    }

    /**
     * 触发后续工作流（级联）
     * 调用 SmartWorkflowOrchestrator 生成任务、通知相关部门
     */
    private int triggerPostExecutionWorkflow(
        ExecutableCommand command,
        Object result,
        Long executorId
    ) {
        try {
            ExecutionResult<Object> wrappedResult = ExecutionResult.success(result, "");
            return smartWorkflow.generatePostExecutionWorkflow(command, wrappedResult);
        } catch (Exception e) {
            log.warn("[Cascade] 级联工作流执行异常，不影响主命令结果: action={}, error={}",
                command.getAction(), e.getMessage());
            return 0;
        }
    }

    /**
     * 生成通知消息
     */
    private String generateNotificationMessage(ExecutableCommand command, Object result) {
        return "✅ 操作已执行: " + command.getAction() +
            " | 目标: " + command.getTargetId() +
            " | 原因: " + command.getReason();
    }

    /**
     * 业务异常
     */
    public static class BusinessException extends RuntimeException {
        public BusinessException(String message) {
            super(message);
        }

        public BusinessException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
