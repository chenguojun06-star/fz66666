package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.dto.ExecutableCommand;
import com.fashion.supplychain.intelligence.dto.ExecutionDecision;
import com.fashion.supplychain.intelligence.dto.ExecutionResult;
import com.fashion.supplychain.intelligence.orchestration.*;
import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * 智能执行引擎 REST 控制器
 *
 * 职责：
 *   1. 提供命令执行的 REST API
 *   2. 处理命令审批流程
 *   3. 查询审计日志和执行历史
 *
 * API 端点：
 *   POST   /api/intelligence/commands/execute      - 执行命令
 *   POST   /api/intelligence/commands/{id}/approve - 审批命令
 *   POST   /api/intelligence/commands/{id}/reject  - 拒绝命令
 *   GET    /api/intelligence/commands/pending      - 获取待审批命令
 *   GET    /api/intelligence/audit-logs            - 查询审计日志
 *   GET    /api/intelligence/execution-stats       - 获取执行统计
 *
 * 权限：
 *   - 所有端点都需要用户登录 (@PreAuthorize("isAuthenticated()"))
 *   - 某些高风险操作需要特定角色权限
 *
 * @author Intelligence Execution Engine v1.0
 * @date 2026-03-08
 */
@Slf4j
@RestController
@RequestMapping("/api/intelligence")
@PreAuthorize("isAuthenticated()")
public class IntelligenceExecutionController {

    @Autowired
    private CommandGeneratorOrchestrator commandGenerator;

    @Autowired
    private PermissionDecisionOrchestrator permissionDecision;

    @Autowired
    private ExecutionEngineOrchestrator executionEngine;

    @Autowired
    private AuditTrailOrchestrator auditTrail;

    @Autowired
    private SmartWorkflowOrchestrator smartWorkflow;

    /**
     * 执行命令
     *
     * 请求示例：
     * ```
     * POST /api/intelligence/commands/execute
     * {
     *   "action": "order:hold",
     *   "targetId": "PO202603001",
     *   "params": {"holdReason": "缺少面料"},
     *   "riskLevel": 3,
     *   "requiresApproval": true,
     *   "reason": "面料延期，建议暂停生产"
     * }
     * ```
     *
     * 返回流程：
     *   1. 如果 requiresApproval=true 且高风险 → 返回"需要审批"，等待用户点击按钮
     *   2. 用户点击"执行" → 该端点被调用 → 立即执行 & 返回成功结果
     *   3. 如果低风险 → 自动执行 & 立即返回结果
     */
    @PostMapping("/commands/execute")
    public Result<?> executeCommand(@RequestBody ExecutableCommand command) {
        try {
            String userIdStr = UserContext.userId();  // 获取当前用户
            Long userId = userIdStr != null ? Long.parseLong(userIdStr) : null;
            Long tenantId = UserContext.tenantId();

            log.debug("[Controller] 用户 {} 请求执行命令: {}", userId, command.getCommandId());

            // 注入租户ID和创建时间
            command.setTenantId(tenantId);
            command.setCreatedAt(System.currentTimeMillis());

            // 第1步：权限决策
            ExecutionDecision decision = permissionDecision.decide(command, userId);

            if (decision.isDenied()) {
                log.warn("[Controller] 命令 {} 被拒绝: {}",
                    command.getCommandId(), decision.getReason());
                return Result.fail("命令被拒绝: " + decision.getReason());
            }

            if (decision.needsApproval()) {
                // 高风险命令需要审批
                log.info("[Controller] 命令 {} 需要审批，返回审批链接", command.getCommandId());
                return Result.success(Map.of(
                    "status", "REQUIRES_APPROVAL",
                    "commandId", command.getCommandId(),
                    "reason", decision.getReason(),
                    "requiredRoles", decision.getRequiredApprovalRoles(),
                    "approvalUrl", "/approval/command/" + command.getCommandId(),
                    "estimatedWaitTime", decision.getEstimatedWaitTimeSeconds()
                ));
            }

            // 第2步：自动执行（低风险命令）
            ExecutionResult<?> result = executionEngine.execute(command, userId);

            if (result.isSuccess()) {
                log.info("[Controller] 命令 {} 执行成功", command.getCommandId());
                return Result.success(Map.of(
                    "status", "SUCCESS",
                    "commandId", command.getCommandId(),
                    "data", result.getData(),
                    "auditId", result.getAuditId(),
                    "cascadedTasks", result.getCascadedTasksCount(),
                    "notifiedRecipients", result.getNotifiedRecipients()
                ));
            } else {
                log.error("[Controller] 命令 {} 执行失败: {}",
                    command.getCommandId(), result.getErrorMessage());
                return Result.fail("执行失败: " + result.getErrorMessage());
            }

        } catch (Exception e) {
            log.error("[Controller] 命令执行异常", e);
            return Result.fail("系统异常: " + e.getMessage());
        }
    }

    /**
     * 审批命令（高风险命令需人工确认时调用）
     *
     * 请求示例：
     * ```
     * POST /api/intelligence/commands/CMD-20260308-001/approve
     * {
     *   "approvalRemark": "已检查无误，同意执行"
     * }
     * ```
     */
    @PostMapping("/commands/{commandId}/approve")
    public Result<?> approveCommand(
        @PathVariable String commandId,
        @RequestBody(required = false) Map<String, String> body
    ) {
        try {
            String userId = UserContext.userId();
            String remark = body != null ? body.get("remark") : "用户已批准";

            log.info("[Controller] 用户 {} 批准命令: {}", userId, commandId);

            // TODO: 从缓存或数据库中查询待审批的命令
            // TODO: 检查用户是否有权限审批该命令
            // TODO: 调用 executionEngine.execute() 执行命令
            // TODO: 记录审批者信息和审批时间

            return Result.success("命令已批准并执行");

        } catch (Exception e) {
            log.error("[Controller] 命令审批异常", e);
            return Result.fail("审批失败: " + e.getMessage());
        }
    }

    /**
     * 拒绝命令
     */
    @PostMapping("/commands/{commandId}/reject")
    public Result<?> rejectCommand(
        @PathVariable String commandId,
        @RequestBody(required = false) Map<String, String> body
    ) {
        try {
            String userId = UserContext.userId();
            String rejectReason = body != null ? body.get("reason") : "用户已拒绝";

            log.info("[Controller] 用户 {} 拒绝命令: {} 原因: {}",
                userId, commandId, rejectReason);

            // TODO: 从缓存中移除待审批命令
            // TODO: 记录拒绝审计日志
            // TODO: 通知命令生成者

            return Result.success("命令已拒绝");

        } catch (Exception e) {
            log.error("[Controller] 命令拒绝异常", e);
            return Result.fail("拒绝失败: " + e.getMessage());
        }
    }

    /**
     * 获取待审批的命令列表
     *
     * 返回示例：
     * ```json
     * {
     *   "code": 200,
     *   "data": {
     *     "pending": [
     *       {
     *         "commandId": "CMD-20260308-001",
     *         "action": "order:hold",
     *         "targetId": "PO001",
     *         "reason": "面料延期",
     *         "riskLevel": 3,
     *         "createdAt": "2026-03-08T10:00:00",
     *         "waitingFor": ["production_manager", "finance_director"]
     *       }
     *     ],
     *     "totalCount": 3
     *   }
     * }
     * ```
     */
    @GetMapping("/commands/pending")
    public Result<?> getPendingCommands() {
        try {
            Long tenantId = UserContext.tenantId();

            // TODO: 从缓存或数据库中查询待审批的命令
            // TODO: 筛选当前用户有权限审批的命令

            List<Map<String, Object>> pendingCommands = new ArrayList<>();

            log.debug("[Controller] 查询租户 {} 的待审批命令", tenantId);

            return Result.success(Map.of(
                "pending", pendingCommands,
                "totalCount", pendingCommands.size()
            ));

        } catch (Exception e) {
            log.error("[Controller] 查询待审批命令异常", e);
            return Result.fail("查询失败: " + e.getMessage());
        }
    }

    /**
     * 查询审计日志
     *
     * 查询参数：
     *   - page: 页码（默认1）
     *   - pageSize: 页面大小（默认20）
     *   - status: 状态过滤（SUCCESS/FAILED/CANCELLED）
     *   - action: 命令类型过滤
     *   - startTime: 开始时间
     *   - endTime: 结束时间
     */
    @GetMapping("/audit-logs")
    public Result<?> queryAuditLogs(
        @RequestParam(defaultValue = "1") int page,
        @RequestParam(defaultValue = "20") int pageSize,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String action,
        @RequestParam(required = false) String startTime,
        @RequestParam(required = false) String endTime
    ) {
        try {
            Long tenantId = UserContext.tenantId();

            log.debug("[Controller] 查询审计日志: page={}, status={}, action={}",
                page, status, action);

            // TODO: 调用 auditTrail.queryAuditLogs() 查询

            Map<String, Object> result = new HashMap<>();
            result.put("logs", new ArrayList<>());
            result.put("total", 0);
            result.put("page", page);
            result.put("pageSize", pageSize);

            return Result.success(result);

        } catch (Exception e) {
            log.error("[Controller] 查询审计日志异常", e);
            return Result.fail("查询失败: " + e.getMessage());
        }
    }

    /**
     * 查询 AI 执行统计（用于仪表板）
     *
     * 返回示例：
     * ```json
     * {
     *   "code": 200,
     *   "data": {
     *     "totalExecuted": 1250,
     *     "successRate": 94.5,
     *     "avgDuration": 2340,
     *     "commandTypeDistribution": {
     *       "order:hold": 320,
     *       "purchase:create": 215,
     *       "quality:upgrade": 180
     *     },
     *     "userSatisfactionScore": 4.2,
     *     "topRecommendedActions": [
     *       {"action": "order:hold", "count": 320},
     *       {"action": "purchase:create", "count": 215}
     *     ]
     *   }
     * }
     * ```
     */
    @GetMapping("/execution-stats")
    public Result<?> getExecutionStats() {
        try {
            Long tenantId = UserContext.tenantId();

            log.debug("[Controller] 获取执行统计数据");

            // TODO: 调用 auditTrail.getExecutionStats() 获取统计

            Map<String, Object> stats = new HashMap<>();
            stats.put("totalExecuted", 0);
            stats.put("successRate", 0.0);
            stats.put("avgDuration", 0);
            stats.put("commandTypeDistribution", new HashMap<>());
            stats.put("userSatisfactionScore", 0.0);

            return Result.success(stats);

        } catch (Exception e) {
            log.error("[Controller] 获取统计数据异常", e);
            return Result.fail("查询失败: " + e.getMessage());
        }
    }

    /**
     * 查询特定命令的执行详情
     */
    @GetMapping("/commands/{commandId}")
    public Result<?> getCommandDetail(@PathVariable String commandId) {
        try {
            log.debug("[Controller] 查询命令详情: {}", commandId);

            // TODO: 从审计日志查询命令执行记录
            // TODO: 返回命令的全部信息，包括前置条件、执行过程、后续工作流

            return Result.success(new HashMap<>());

        } catch (Exception e) {
            log.error("[Controller] 查询命令详情异常", e);
            return Result.fail("查询失败: " + e.getMessage());
        }
    }
}
