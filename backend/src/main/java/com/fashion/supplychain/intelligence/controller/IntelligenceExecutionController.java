package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.ExecutableCommand;
import com.fashion.supplychain.intelligence.dto.ExecutionDecision;
import com.fashion.supplychain.intelligence.dto.ExecutionResult;
import com.fashion.supplychain.intelligence.orchestration.*;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;
import java.time.LocalDateTime;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.intelligence.entity.IntelligenceAuditLog;
import com.fashion.supplychain.intelligence.mapper.IntelligenceAuditLogMapper;
import com.fasterxml.jackson.databind.ObjectMapper;

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
@RequiredArgsConstructor
public class IntelligenceExecutionController {


    private final PermissionDecisionOrchestrator permissionDecision;

    private final ExecutionEngineOrchestrator executionEngine;

    private final AuditTrailOrchestrator auditTrail;

    private final IntelligenceAuditLogMapper auditLogMapper;

    private final ObjectMapper objectMapper;

    private final ProductionAgenticCrewOrchestrator crewOrchestrator;

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
    @org.springframework.transaction.annotation.Transactional
    public Result<?> executeCommand(@RequestBody ExecutableCommand command) {
        try {
            String userIdStr = UserContext.userId();  // 获取当前用户
            Long userId = userIdStr != null ? Long.parseLong(userIdStr) : null;
            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

            log.debug("[Controller] 用户 {} 请求执行命令: {}", userId, command.getCommandId());

            // 注入租户ID和创建时间
            command.setTenantId(tenantId);
            command.setCreatedAt(System.currentTimeMillis());
            if (command.getCommandId() == null || command.getCommandId().isEmpty()) {
                command.generateCommandId();
            }

            // 第1步：权限决策
            ExecutionDecision decision = permissionDecision.decide(command, userId);

            if (decision.isDenied()) {
                log.warn("[Controller] 命令 {} 被拒绝: {}",
                    command.getCommandId(), decision.getReason());
                return Result.fail("命令被拒绝: " + decision.getReason());
            }

            if (decision.needsApproval()) {
                // 高风险命令需要审批 — 持久化到DB，以便后续 approve/reject 操作查询
                log.info("[Controller] 命令 {} 需要审批，写入待审批记录", command.getCommandId());
                IntelligenceAuditLog pending = new IntelligenceAuditLog();
                pending.setCommandId(command.getCommandId());
                pending.setTenantId(tenantId);
                pending.setAction(command.getAction());
                pending.setTargetId(command.getTargetId());
                pending.setExecutorId(userId != null ? userId.toString() : null);
                pending.setStatus("PENDING_APPROVAL");
                pending.setReason(command.getReason());
                pending.setRiskLevel(command.getRiskLevel());
                pending.setRequiresApproval(true);
                pending.setResultData(objectMapper.writeValueAsString(command));
                pending.setCreatedAt(LocalDateTime.now());
                auditLogMapper.insert(pending);

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
    @org.springframework.transaction.annotation.Transactional
    public Result<?> approveCommand(
        @PathVariable String commandId,
        @RequestBody(required = false) Map<String, String> body
    ) {
        try {
            String userId = UserContext.userId();
            String remark = body != null ? body.get("remark") : "用户已批准";
            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

            log.info("[Controller] 用户 {} 批准命令: {}", userId, commandId);

            QueryWrapper<IntelligenceAuditLog> qw = new QueryWrapper<>();
            qw.eq("command_id", commandId).eq("status", "PENDING_APPROVAL")
              .eq("tenant_id", tenantId);
            IntelligenceAuditLog pendingLog = auditLogMapper.selectOne(qw);
            if (pendingLog == null) {
                return Result.fail("待审批命令不存在或已处理: " + commandId);
            }

            // 反序列化原始命令
            ExecutableCommand originalCommand = objectMapper.readValue(
                pendingLog.getResultData(), ExecutableCommand.class);

            // 更新审批信息
            pendingLog.setStatus("APPROVED");
            pendingLog.setApprovedBy(userId);
            pendingLog.setApprovedAt(LocalDateTime.now());
            pendingLog.setApprovalRemark(remark != null ? remark : "用户已批准");
            auditLogMapper.updateById(pendingLog);

            // 执行命令
            Long userIdLong = userId != null ? Long.parseLong(userId) : null;
            ExecutionResult<?> result = executionEngine.execute(originalCommand, userIdLong);

            if (result.isSuccess()) {
                log.info("[Controller] 命令 {} 审批并执行成功", commandId);
                return Result.success(Map.of(
                    "status", "SUCCESS",
                    "commandId", commandId,
                    "message", "命令已批准并执行"
                ));
            } else {
                log.error("[Controller] 命令 {} 审批后执行失败: {}",
                    commandId, result.getErrorMessage());
                return Result.fail("执行失败: " + result.getErrorMessage());
            }

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
            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

            log.info("[Controller] 用户 {} 拒绝命令: {} 原因: {}",
                userId, commandId, rejectReason);

            QueryWrapper<IntelligenceAuditLog> qw = new QueryWrapper<>();
            qw.eq("command_id", commandId).eq("status", "PENDING_APPROVAL")
              .eq("tenant_id", tenantId);
            IntelligenceAuditLog pendingLog = auditLogMapper.selectOne(qw);
            if (pendingLog == null) {
                return Result.fail("待审批命令不存在或已处理: " + commandId);
            }

            pendingLog.setStatus("REJECTED");
            pendingLog.setApprovedBy(userId);
            pendingLog.setApprovedAt(LocalDateTime.now());
            pendingLog.setApprovalRemark(rejectReason != null ? rejectReason : "用户已拒绝");
            auditLogMapper.updateById(pendingLog);

            log.info("[Controller] 命令 {} 已拒绝", commandId);
            return Result.success(Map.of(
                "status", "REJECTED",
                "commandId", commandId,
                "message", "命令已拒绝"
            ));

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
            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

            // 从 DB 查询当前租户的待审批命令
            QueryWrapper<IntelligenceAuditLog> qw = new QueryWrapper<>();
            qw.eq("tenant_id", tenantId)
              .eq("status", "PENDING_APPROVAL")
              .orderByDesc("created_at");
            List<IntelligenceAuditLog> logs = auditLogMapper.selectList(qw);

            List<Map<String, Object>> pendingCommands = logs.stream().map(l -> {
                Map<String, Object> cmd = new HashMap<>();
                cmd.put("commandId", l.getCommandId());
                cmd.put("action", l.getAction());
                cmd.put("targetId", l.getTargetId());
                cmd.put("reason", l.getReason());
                cmd.put("riskLevel", l.getRiskLevel());
                cmd.put("createdAt", l.getCreatedAt());
                cmd.put("executorId", l.getExecutorId());
                cmd.put("waitingFor", getApprovalRolesForAction(l.getAction()));
                try {
                    ExecutableCommand originalCommand = objectMapper.readValue(
                            l.getResultData(), ExecutableCommand.class);
                    cmd.put("params", originalCommand.getParams() != null ? originalCommand.getParams() : Map.of());
                    cmd.put("requiresApproval", originalCommand.getRequiresApproval());
                } catch (Exception ignored) {
                    cmd.put("params", Map.of());
                    cmd.put("requiresApproval", true);
                }
                return cmd;
            }).collect(Collectors.toList());

            log.debug("[Controller] 查询租户 {} 的待审批命令: {}个", tenantId, pendingCommands.size());

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
            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

            log.debug("[Controller] 查询审计日志: page={}, status={}, action={}",
                page, status, action);

            // 委托 AuditTrail 查询
            Page<IntelligenceAuditLog> pageResult =
                auditTrail.queryAuditLogs(tenantId, page, pageSize, status);

            Map<String, Object> result = new HashMap<>();
            result.put("logs", pageResult.getRecords());
            result.put("total", pageResult.getTotal());
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
            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

            log.debug("[Controller] 获取执行统计数据");

            // 委托 AuditTrail 获取统计
            Map<String, Object> stats = auditTrail.getExecutionStats(tenantId);

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
            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
            log.debug("[Controller] 查询命令详情: {}", commandId);

            QueryWrapper<IntelligenceAuditLog> qw = new QueryWrapper<>();
            qw.eq("command_id", commandId)
              .eq("tenant_id", tenantId)
              .orderByDesc("created_at").last("LIMIT 1");
            IntelligenceAuditLog auditLog = auditLogMapper.selectOne(qw);
            if (auditLog == null) {
                return Result.fail("命令记录不存在: " + commandId);
            }

            Map<String, Object> detail = new HashMap<>();
            detail.put("commandId", auditLog.getCommandId());
            detail.put("action", auditLog.getAction());
            detail.put("targetId", auditLog.getTargetId());
            detail.put("status", auditLog.getStatus());
            detail.put("reason", auditLog.getReason());
            detail.put("riskLevel", auditLog.getRiskLevel());
            detail.put("executorId", auditLog.getExecutorId());
            detail.put("createdAt", auditLog.getCreatedAt());
            detail.put("approvedBy", auditLog.getApprovedBy());
            detail.put("approvedAt", auditLog.getApprovedAt());
            detail.put("approvalRemark", auditLog.getApprovalRemark());
            detail.put("resultData", auditLog.getResultData());
            detail.put("errorMessage", auditLog.getErrorMessage());
            detail.put("durationMs", auditLog.getDurationMs());

            return Result.success(detail);

        } catch (Exception e) {
            log.error("[Controller] 查询命令详情异常", e);
            return Result.fail("查询失败: " + e.getMessage());
        }
    }

    /**
     * 自然语言指令执行（手机端管理员/跟单员专用）
     *
     * 请求体: { "text": "把PO20260501001订单暂停" }
     * 流程: LLM解析自然语言 → 结构化命令 → 执行/生成待审批
     */
    @PostMapping("/crew/nl-execute")
    public Result<?> naturalLanguageExecute(@RequestBody Map<String, Object> body) {
        try {
            String text = body != null ? (String) body.getOrDefault("text", (String) body.get("naturalLanguageCommand")) : null;
            if (text == null || text.isBlank()) {
                return Result.fail("指令内容不能为空");
            }
            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
            String userIdStr = UserContext.userId();
            Long operatorId = userIdStr != null ? Long.parseLong(userIdStr) : null;

            log.info("[NL-Execute] 用户 {} 发起自然语言指令: {}", operatorId, text);
            ExecutionResult<?> result = crewOrchestrator.executeNaturalLanguageCommand(tenantId, operatorId, text);

            if (result.isSuccess()) {
                return Result.success(Map.of(
                    "status", "SUCCESS",
                    "data", result.getData() != null ? result.getData() : Map.of()
                ));
            } else {
                return Result.fail("执行失败: " + result.getErrorMessage());
            }
        } catch (Exception e) {
            log.error("[NL-Execute] 自然语言指令执行异常", e);
            return Result.fail("系统异常: " + e.getMessage());
        }
    }

    private String[] getApprovalRolesForAction(String action) {
        if (action == null) {
            return new String[]{"MANAGER"};
        }
        return switch (action) {
            case "order:hold", "order:expedite", "order:approve", "order:reject" ->
                new String[]{"PRODUCTION_DIRECTOR"};
            case "style:approve", "style:return" ->
                new String[]{"STYLE_DIRECTOR", "ADMIN"};
            case "quality:reject" ->
                new String[]{"QC_DIRECTOR", "PRODUCTION_DIRECTOR"};
            case "settlement:approve" ->
                new String[]{"FINANCE_DIRECTOR"};
            case "payroll:approve" ->
                new String[]{"FINANCE_DIRECTOR"};
            case "purchase:create" ->
                new String[]{"PROCUREMENT_DIRECTOR", "ADMIN"};
            case "scan:undo", "cutting:create", "order:edit" ->
                new String[]{"PRODUCTION_DIRECTOR"};
            case "defective:handle" ->
                new String[]{"QC_DIRECTOR", "PRODUCTION_DIRECTOR"};
            default -> new String[]{"MANAGER"};
        };
    }
}
