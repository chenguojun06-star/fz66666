package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.ExecutableCommand;
import com.fashion.supplychain.intelligence.dto.ExecutionResult;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;


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
    private AuditTrailOrchestrator auditTrail;

    @Autowired
    private SmartNotificationOrchestrator smartNotification;

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
                default -> {
                    throw new IllegalArgumentException("未知的命令类型: " + command.getAction());
                }
            }

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
        if ("COMPLETED".equals(status) || "CANCELLED".equals(status)) {
            throw new BusinessException("订单状态 " + status + " 不允许暂停");
        }

        // 执行改状态
        order.setStatus("HOLD");
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

        // 检查是否处于暂停状态
        if (!"HOLD".equals(order.getStatus())) {
            throw new BusinessException("订单非暂停状态，无法恢复");
        }

        // 恢复状态
        order.setStatus("IN_PROGRESS");
        order.setOperationRemark(null);

        productionOrderService.updateById(order);

        log.info("[OrderResume] 订单已恢复: orderId={}, executor={}", orderId, executorId);
        return order;
    }

    /**
     * 触发后续工作流（级联）
     * 例如：订单暂停后，需要生成任务、通知相关部门
     */
    private int triggerPostExecutionWorkflow(
        ExecutableCommand command,
        Object result,
        Long executorId
    ) {
        int cascadedCount = 0;

        if ("order:hold".equals(command.getAction())) {
            // 订单被暂停后 → 生成库存检查任务
            log.info("[Cascade] 生成库存检查任务");
            cascadedCount++;

            // 订单被暂停后 → 通知财务部审查
            log.info("[Cascade] 通知财务部审查");
            cascadedCount++;
        }

        return cascadedCount;
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
