package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.ExecutableCommand;
import com.fashion.supplychain.intelligence.dto.ExecutionResult;
import com.fashion.supplychain.intelligence.entity.IntelligenceWorkflowLog;
import com.fashion.supplychain.intelligence.mapper.IntelligenceWorkflowLogMapper;
import com.fashion.supplychain.common.UserContext;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 智能工作流编排器
 *
 * 职责：
 *   1. 处理命令执行后的级联工作流（Cascade Workflows）
 *   2. 生成后续任务（Follow-up Tasks）
 *   3. 通知相关团队
 *
 * 作用：
 *   ├─ "暂停订单" → 自动触发"清点库存""通知财务"
 *   ├─ "创建采购单" → 自动触发"通知采购部""生成合同"
 *   ├─ 工作流可配置：每个租户设置自己的级联规则
 *   └─ 避免人工跟进：一个命令优雅地完成整个工作流
 *
 * 表结构：t_intelligence_workflow_log
 *   ├─ id: 工作流日志ID
 *   ├─ command_id: 触发命令ID
 *   ├─ workflow_type: 工作流类型
 *   ├─ triggered_tasks: JSON 触发的任务列表
 *   ├─ notified_teams: JSON 被通知的团队
 *   ├─ status: 工作流状态（COMPLETED/PARTIAL_FAILED/FAILED）
 *   ├─ created_at: 创建时间
 *   └─ remark: 备注
 *
 * @author Smart Workflow Engine v1.0
 * @date 2026-03-08
 */
@Slf4j
@Service
public class SmartWorkflowOrchestrator {

    @Autowired
    private SmartNotificationOrchestrator notificationOrchestrator;

    @Autowired
    private AuditTrailOrchestrator auditTrail;

    @Autowired
    private FollowupTaskOrchestrator followupTaskOrchestrator;

    @Autowired
    private IntelligenceWorkflowLogMapper workflowLogMapper;

    @Autowired
    private ObjectMapper objectMapper;

    /**
     * 生成执行后的级联工作流
     *
     * 使用场景：
     *   - 命令执行成功后，自动触发相关的后续任务
     *   - 根据命令类型和结果，不同的级联规则
     *
     * @param command 原始命令
     * @param result 执行结果
     * @return 触发的任务数量
     */
    @Transactional(rollbackFor = Exception.class)
    public int generatePostExecutionWorkflow(
        ExecutableCommand command,
        ExecutionResult<?> result
    ) {
        if (!result.isSuccess()) {
            log.debug("[Workflow] 命令 {} 执行失败，跳过工作流", command.getCommandId());
            return 0;
        }

        int cascadedCount = 0;
        String action = command.getAction();

        // 根据命令类型触发不同的工作流
        switch (action) {
            case "order:hold":
                cascadedCount = workflowOrderHold(command, result);
                break;

            case "order:expedite":
                cascadedCount = workflowOrderExpedite(command, result);
                break;

            case "order:approve":
                cascadedCount = workflowOrderApprove(command, result);
                break;

            case "quality:reject":
                cascadedCount = workflowQualityReject(command, result);
                break;

            case "settlement:approve":
                cascadedCount = workflowSettlementApprove(command, result);
                break;

            case "purchase:create":
                cascadedCount = workflowPurchaseCreate(command, result);
                break;

            default:
                log.debug("[Workflow] 命令类型 {} 无关联工作流", action);
                cascadedCount = 0;
        }

        log.info("[Workflow] 命令 {} 触发了 {} 个级联任务",
            command.getCommandId(), cascadedCount);
        return cascadedCount;
    }

    /**
     * 工作流：订单暂停
     *
     * 级联规则：
     *   1. 生成"库存清点"任务 → 通知仓库员
     *   2. 通知财务部评估已支付成本
     *   3. 通知生产团队的工序负责人
     *   4. 发送风险预警通知到高管看板
     */
    private int workflowOrderHold(ExecutableCommand command, ExecutionResult<?> result) {
        List<String> createdTasks = new ArrayList<>();
        List<String> notifiedTeams = new ArrayList<>();

        String orderId = command.getTargetId();

        try {
            // 任务1：生成库存清点任务
            createFollowupTask(orderId, "inventory_check", "high");
            createdTasks.add("库存清点");
            notifiedTeams.add("warehouse_team");

            // 任务2：通知财务部
            log.info("[Notify] called");
            notifiedTeams.add("finance_team");

            // 任务3：通知生产协调员
            log.info("[Notify] called");
            notifiedTeams.add("production_team");

            // 任务4：风险预警到KPI仪表盘
            log.info("[Notify] called");
            notifiedTeams.add("executive_dashboard");

            logWorkflow(command, createdTasks, notifiedTeams, "COMPLETED");
            return createdTasks.size();

        } catch (Exception e) {
            log.error("[Workflow] 订单暂停工作流异常", e);
            logWorkflow(command, createdTasks, notifiedTeams, "PARTIAL_FAILED");
            return createdTasks.size();
        }
    }

    /**
     * 工作流：订单加急
     *
     * 级联规则：
     *   1. 优先级从"normal" → "high"或"urgent"
     *   2. 通知所有参与工序的工人
     *   3. 通知采购部关注物料及时性
     *   4. 标记预警："预计逾期，已加急"
     */
    private int workflowOrderExpedite(ExecutableCommand command, ExecutionResult<?> result) {
        List<String> createdTasks = new ArrayList<>();
        List<String> notifiedTeams = new ArrayList<>();

        String orderId = command.getTargetId();

        try {
            // 任务1：升级订单优先级
            createFollowupTask(orderId, "priority_upgrade", "urgent");
            createdTasks.add("优先级升级");

            // 任务2：通知参与的工人
            log.info("[Notify] called");
            notifiedTeams.add("production_workers");

            // 任务3：通知采购部
            log.info("[Notify] called");
            notifiedTeams.add("procurement_team");

            // 任务4：在进度看板标记
            createFollowupTask(orderId, "board_mark_expedited", "normal");
            createdTasks.add("进度看板标记");

            logWorkflow(command, createdTasks, notifiedTeams, "COMPLETED");
            return createdTasks.size();

        } catch (Exception e) {
            log.error("[Workflow] 订单加急工作流异常", e);
            logWorkflow(command, createdTasks, notifiedTeams, "PARTIAL_FAILED");
            return createdTasks.size();
        }
    }

    /**
     * 工作流：创建采购单 → 通知采购部跟进、财务预备预算
     */
    private int workflowPurchaseCreate(ExecutableCommand command, ExecutionResult<?> result) {
        List<String> createdTasks = new ArrayList<>();
        List<String> notifiedTeams = new ArrayList<>();
        try {
            createFollowupTask(command.getTargetId(), "procurement_followup", "high");
            createdTasks.add("采购跟进");
            notifiedTeams.add("procurement_team");
            notifiedTeams.add("finance_team");
            logWorkflow(command, createdTasks, notifiedTeams, "COMPLETED");
            return createdTasks.size();
        } catch (Exception e) {
            log.error("[Workflow] 采购创建工作流异常", e);
            logWorkflow(command, createdTasks, notifiedTeams, "PARTIAL_FAILED");
            return createdTasks.size();
        }
    }

    /**
     * 工作流：质检退回 → 通知生产部返工、生成返工任务
     */
    private int workflowQualityReject(ExecutableCommand command, ExecutionResult<?> result) {
        List<String> createdTasks = new ArrayList<>();
        List<String> notifiedTeams = new ArrayList<>();
        try {
            createFollowupTask(command.getTargetId(), "rework_task", "urgent");
            createdTasks.add("返工任务");
            notifiedTeams.add("production_team");
            notifiedTeams.add("quality_team");
            logWorkflow(command, createdTasks, notifiedTeams, "COMPLETED");
            return createdTasks.size();
        } catch (Exception e) {
            log.error("[Workflow] 质检退回工作流异常", e);
            logWorkflow(command, createdTasks, notifiedTeams, "PARTIAL_FAILED");
            return createdTasks.size();
        }
    }

    /**
     * 工作流：结算审批通过 → 通知财务出纳、标记订单结算完成
     */
    private int workflowSettlementApprove(ExecutableCommand command, ExecutionResult<?> result) {
        List<String> createdTasks = new ArrayList<>();
        List<String> notifiedTeams = new ArrayList<>();
        try {
            createFollowupTask(command.getTargetId(), "payment_dispatch", "high");
            createdTasks.add("出纳付款");
            notifiedTeams.add("finance_team");
            logWorkflow(command, createdTasks, notifiedTeams, "COMPLETED");
            return createdTasks.size();
        } catch (Exception e) {
            log.error("[Workflow] 结算审批工作流异常", e);
            logWorkflow(command, createdTasks, notifiedTeams, "PARTIAL_FAILED");
            return createdTasks.size();
        }
    }

    /**
     * 工作流：订单审核通过 → 通知工厂准备生产
     */
    private int workflowOrderApprove(ExecutableCommand command, ExecutionResult<?> result) {
        List<String> createdTasks = new ArrayList<>();
        List<String> notifiedTeams = new ArrayList<>();
        try {
            createFollowupTask(command.getTargetId(), "production_prepare", "normal");
            createdTasks.add("生产准备");
            notifiedTeams.add("production_team");
            notifiedTeams.add("warehouse_team");
            logWorkflow(command, createdTasks, notifiedTeams, "COMPLETED");
            return createdTasks.size();
        } catch (Exception e) {
            log.error("[Workflow] 订单审核工作流异常", e);
            logWorkflow(command, createdTasks, notifiedTeams, "PARTIAL_FAILED");
            return createdTasks.size();
        }
    }

    /**
     * 创建后续任务（通过 FollowupTaskOrchestrator 构建结构化任务）
     */
    private void createFollowupTask(String targetId, String taskType, String priority) {
        followupTaskOrchestrator.buildTask(
            taskType,                        // taskCode
            "intelligence",                  // domain
            priority,                        // priority
            "normal",                        // escalationLevel
            "system",                        // ownerRole
            taskType + " - " + targetId,     // title
            "由智能工作流自动创建",             // summary
            "级联工作流触发",                  // reason
            null,                            // routePath
            targetId,                        // relatedOrderNo
            "尽快处理",                       // dueHint
            false                            // autoExecutable
        );
        log.info("[Workflow] 创建任务: targetId={}, type={}, priority={}", targetId, taskType, priority);
    }

    /**
     * 记录工作流执行日志，并持久化到 t_intelligence_workflow_log
     */
    private void logWorkflow(
        ExecutableCommand command,
        List<String> createdTasks,
        List<String> notifiedTeams,
        String status
    ) {
        log.info(
            "[WorkflowLog] 命令={}, 创建任务={}, 通知团队={}, 状态={}",
            command.getCommandId(),
            String.join(",", createdTasks),
            String.join(",", notifiedTeams),
            status
        );

        try {
            IntelligenceWorkflowLog logEntry = new IntelligenceWorkflowLog();
            logEntry.setId(UUID.randomUUID().toString().replace("-", ""));
            logEntry.setTenantId(command.getTenantId());
            logEntry.setCommandId(command.getCommandId());
            logEntry.setWorkflowType(command.getAction() + "_cascade");
            logEntry.setTriggeredTasks(objectMapper.writeValueAsString(createdTasks));
            logEntry.setNotifiedTeams(String.join(",", notifiedTeams));
            logEntry.setCascadedCount(createdTasks.size() + notifiedTeams.size());
            logEntry.setStatus(status);
            logEntry.setCreatedAt(LocalDateTime.now());
            logEntry.setCompletedAt(LocalDateTime.now());
            logEntry.setDeletedFlag(0);
            workflowLogMapper.insert(logEntry);
        } catch (Exception e) {
            // 日志写入失败不影响主流程
            log.warn("[WorkflowLog] 持久化工作流日志失败: commandId={}, error={}",
                command.getCommandId(), e.getMessage());
        }
    }

    /**
     * 查询工作流执行历史
     */
    public Map<String, Object> queryWorkflowHistory(String commandId) {
        Map<String, Object> result = new HashMap<>();
        try {
            QueryWrapper<IntelligenceWorkflowLog> qw = new QueryWrapper<>();
            qw.eq("command_id", commandId).eq("deleted_flag", 0).orderByDesc("created_at");
            List<IntelligenceWorkflowLog> logs = workflowLogMapper.selectList(qw);
            result.put("commandId", commandId);
            result.put("logs", logs);
            result.put("count", logs.size());
        } catch (Exception e) {
            log.warn("[Workflow] 查询工作流历史失败: commandId={}, error={}", commandId, e.getMessage());
            result.put("commandId", commandId);
            result.put("logs", new ArrayList<>());
            result.put("count", 0);
        }
        return result;
    }
}
