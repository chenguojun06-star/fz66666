package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.ExecutableCommand;
import com.fashion.supplychain.intelligence.dto.ExecutionDecision;
import com.fashion.supplychain.intelligence.dto.ExecutionResult;
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

    @Autowired private CommandExecutorHelper commandExecutor;
    @Autowired private AuditTrailOrchestrator auditTrail;
    @Autowired private PermissionDecisionOrchestrator permissionDecision;
    @Autowired private SmartWorkflowOrchestrator smartWorkflow;

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

            // 1.5 权限决策 — 判断是否可自动执行
            ExecutionDecision decision = permissionDecision.decide(command, executorId);
            if (decision.isDenied()) {
                auditTrail.logCommandCancelled(command, "权限不足: " + decision.getReason(), executorId);
                log.warn("[ExecutionEngine] 命令被拒绝: action={}, reason={}", command.getAction(), decision.getReason());
                return (ExecutionResult<T>) ExecutionResult.failure("权限不足: " + decision.getReason());
            }
            if (decision.needsApproval()) {
                auditTrail.logCommandCancelled(command, "需人工审批: " + decision.getReason(), executorId);
                log.info("[ExecutionEngine] 命令需人工审批: action={}, reason={}", command.getAction(), decision.getReason());
                return (ExecutionResult<T>) ExecutionResult.pending(decision.getReason());
            }

            // 2. 根据命令类型分发执行
            Object result = null;
            // 撤回命令特殊处理（不保存快照）
            if ("undo:last".equals(command.getAction())) {
                result = commandExecutor.executeUndoLast(executorId);
            } else {
                // 保存快照供撤回
                commandExecutor.takePreExecutionSnapshot(command, executorId);

                result = switch (command.getAction()) {
                case "order:hold" -> commandExecutor.executeOrderHold(command, executorId);
                case "order:expedite" -> commandExecutor.executeOrderExpedite(command, executorId);
                case "order:resume" -> commandExecutor.executeOrderResume(command, executorId);
                case "order:remark" -> commandExecutor.executeOrderRemark(command, executorId);
                case "material:safety_stock" -> commandExecutor.executeMaterialSafetyStock(command, executorId);
                case "notification:push" -> commandExecutor.executeNotificationPush(command, executorId);
                case "order:approve" -> commandExecutor.executeOrderApprove(command, executorId);
                case "order:reject" -> commandExecutor.executeOrderReject(command, executorId);
                case "style:approve" -> commandExecutor.executeStyleApprove(command, executorId);
                case "style:return" -> commandExecutor.executeStyleReturn(command, executorId);
                case "quality:reject" -> commandExecutor.executeQualityReject(command, executorId);
                case "settlement:approve" -> commandExecutor.executeSettlementApprove(command, executorId);
                case "purchase:create"         -> commandExecutor.executePurchaseCreate(command, executorId);
                case "factory:urge"            -> commandExecutor.executeFactoryUrge(command, executorId);
                case "process:reassign"        -> commandExecutor.executeProcessReassign(command, executorId);
                case "order:ship_date"         -> commandExecutor.executeOrderShipDate(command, executorId);
                case "order:add_note"          -> commandExecutor.executeOrderAddNote(command, executorId);
                case "procurement:order_goods" -> commandExecutor.executeProcurementOrderGoods(command, executorId);
                default -> throw new IllegalArgumentException("未知的命令类型: " + command.getAction());
                };
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
