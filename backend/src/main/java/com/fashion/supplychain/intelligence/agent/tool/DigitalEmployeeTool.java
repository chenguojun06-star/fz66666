package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.ExecutionResult;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.*;

/**
 * 数字员工工具 — 让AI真正能"做事"
 * <p>
 * 接入 ExecutionEngine 的 20+ 种业务操作，用户说一句话，AI 就能执行。
 * <p>
 * <b>支持的操作类型：</b>
 * <ul>
 *   <li>订单操作：暂停/加急/恢复/审批/驳回/改货期/加备注/编辑</li>
 *   <li>质检操作：质检拒绝/次品处理</li>
 *   <li>采购操作：创建采购单/下采购订单/物料安全库存</li>
 *   <li>生产操作：工序重分配/催工厂/创建裁剪单/扫码撤回</li>
 *   <li>财务操作：结算审批/工资审批</li>
 *   <li>款式操作：款式审批/款式退回</li>
 *   <li>其他：撤回上一步操作</li>
 * </ul>
 *
 * <p><b>设计原则：</b>
 * <ul>
 *   <li>AI 只负责"理解意图"，实际执行全权交 ExecutionEngine</li>
 *   <li>权限/审计/回滚全部由 ExecutionEngine 处理</li>
 *   <li>高风险操作自动要求人工确认</li>
 * </ul>
 */
@Slf4j
@Component
@Lazy
public class DigitalEmployeeTool extends AbstractAgentTool {

    @Autowired
    private ObjectProvider<com.fashion.supplychain.intelligence.orchestration.ProductionAgenticCrewOrchestrator> crewOrchestratorProvider;

    @Autowired
    private ObjectProvider<com.fashion.supplychain.intelligence.orchestration.ExecutionEngineOrchestrator> executionEngineProvider;

    @Autowired
    private ObjectProvider<com.fashion.supplychain.intelligence.orchestration.AuditLogOrchestrator> auditLogOrchestratorProvider;

    @Autowired
    private ObjectProvider<com.fasterxml.jackson.databind.ObjectMapper> objectMapperProvider;

    @Autowired
    private ObjectProvider<com.fashion.supplychain.intelligence.orchestration.MultiStepTaskOrchestrator> multiStepOrchestratorProvider;

    @Override
    public String getName() {
        return "tool_digital_employee";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        properties.put("instruction", Map.of(
                "type", "string",
                "description",
                "用自然语言描述要执行的操作，越具体越好。\n" +
                "单步操作示例：\n" +
                "- 暂停订单 PO20260101001\n" +
                "- 把 PO20260102005 加急处理\n" +
                "- 审批款式 S2026001\n" +
                "- 驳回订单 PO20260103002，原因：物料不全\n" +
                "- 修改 PO20260104003 的交货期为 2026-02-15\n" +
                "- 给 PO20260105004 添加备注：客户要求加急\n" +
                "- 质检拒绝 PO20260106005，次品率过高\n" +
                "- 为 PO20260107006 创建采购单\n" +
                "- 撤回上一步操作\n" +
                "多步操作示例（需配合 action=multi_step 使用）：\n" +
                "- 先把 PO20260101 暂停，再加备注：客户要求延迟，然后通知采购部\n" +
                "- 把 S2026001 款式审批通过，然后创建采购单，最后催一下工厂\n" +
                "如果是确认/拒绝待审批命令，使用 commandId + action 参数。"
        ));

        properties.put("commandId", Map.of(
                "type", "string",
                "description",
                "待审批命令的ID（仅在 action=confirm 或 action=reject 时使用）"
        ));

        properties.put("action", Map.of(
                "type", "string",
                "description",
                "操作模式：" +
                "execute(默认，执行单步新指令) / " +
                "multi_step(执行多步任务，一句话包含多个操作) / " +
                "confirm(确认并执行待审批命令) / " +
                "reject(拒绝待审批命令)"
        ));

        properties.put("remark", Map.of(
                "type", "string",
                "description",
                "审批/拒绝备注（可选）"
        ));

        properties.put("orderNo", Map.of(
                "type", "string",
                "description",
                "订单号或款式号（可选，如果 instruction 里已经包含了就不用填）"
        ));

        properties.put("reason", Map.of(
                "type", "string",
                "description",
                "操作原因（可选，会记录到审计日志）"
        ));

        properties.put("rollbackOnFailure", Map.of(
                "type", "boolean",
                "description",
                "多步任务失败时是否自动回滚已执行的步骤（默认 false）。" +
                "仅在 action=multi_step 时有效。"
        ));

        return buildToolDef(
                "数字员工 - 执行实际业务操作的工具。" +
                "当用户要求执行具体操作时调用，例如：暂停订单、加急、审批、驳回、改货期、加备注、" +
                "质检拒绝、创建采购单、工序重分配、催工厂、撤回操作等。" +
                "支持20+种业务操作，所有操作均有权限校验和审计日志。" +
                "高风险操作会返回待审批状态，需要用户确认后才能执行。" +
                "当用户说'确定''执行''同意'时，用 action=confirm 确认待审批命令；" +
                "当用户说'算了''不要''取消'时，用 action=reject 拒绝。",
                properties,
                List.of("instruction")
        );
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String actionMode = optionalString(args, "action");
        String commandId = optionalString(args, "commandId");
        String remark = optionalString(args, "remark");
        String instruction = optionalString(args, "instruction");
        String orderNo = optionalString(args, "orderNo");
        String reason = optionalString(args, "reason");

        Long tenantId = UserContext.tenantId();
        Long userId = UserContext.userId() != null ? Long.parseLong(UserContext.userId()) : null;

        // 模式1：确认待审批命令
        if ("confirm".equalsIgnoreCase(actionMode) && commandId != null) {
            return handleConfirm(commandId, tenantId, userId, remark);
        }

        // 模式2：拒绝待审批命令
        if ("reject".equalsIgnoreCase(actionMode) && commandId != null) {
            return handleReject(commandId, tenantId, userId, remark);
        }

        // 模式3：多步任务
        if ("multi_step".equalsIgnoreCase(actionMode)) {
            if (instruction == null || instruction.isBlank()) {
                return errorJson("多步任务需要提供 instruction 参数");
            }
            boolean rollbackOnFailure = args.containsKey("rollbackOnFailure") &&
                    Boolean.TRUE.equals(args.get("rollbackOnFailure"));
            return handleMultiStep(instruction, tenantId, userId, rollbackOnFailure);
        }

        // 模式4：执行单步新指令（默认）
        if (instruction == null || instruction.isBlank()) {
            return errorJson("请提供要执行的操作指令（instruction 参数）");
        }

        log.info("[DigitalEmployee] 收到操作指令: tenant={}, user={}, instruction={}",
                tenantId, userId, instruction);

        StringBuilder fullInstruction = new StringBuilder(instruction);
        if (orderNo != null && !instruction.contains(orderNo)) {
            fullInstruction.append(" 目标：").append(orderNo);
        }
        if (reason != null) {
            fullInstruction.append(" 原因：").append(reason);
        }

        com.fashion.supplychain.intelligence.orchestration.ProductionAgenticCrewOrchestrator crewOrchestrator =
                crewOrchestratorProvider.getIfAvailable();
        if (crewOrchestrator == null) {
            return errorJson("数字员工服务未启用，请稍后重试");
        }

        ExecutionResult<?> result = crewOrchestrator.executeNaturalLanguageCommand(
                tenantId, userId, fullInstruction.toString());

        boolean isPending = "REQUIRES_APPROVAL".equals(result.getErrorMessage());

        Map<String, Object> resultMap = new LinkedHashMap<>();
        resultMap.put("success", result.isSuccess());
        resultMap.put("pending", isPending);
        resultMap.put("message", result.getMessage());

        if (isPending) {
            resultMap.put("requiresApproval", true);
            resultMap.put("approvalReason", result.getMessage());
            resultMap.put("commandId", result.getCommandId());
            resultMap.put("nextStep",
                    "请询问用户是否确认执行。用户说'确定/执行/同意'时用 action=confirm + commandId 确认；" +
                    "用户说'算了/不要/取消'时用 action=reject + commandId 拒绝。");
        }

        if (result.getData() != null) {
            resultMap.put("data", result.getData());
        }
        if (result.getAuditId() != null) {
            resultMap.put("auditId", result.getAuditId());
        }
        if (result.getCommandId() != null) {
            resultMap.put("commandId", result.getCommandId());
        }

        log.info("[DigitalEmployee] 操作完成: success={}, pending={}, message={}",
                result.isSuccess(), isPending, result.getMessage());

        return MAPPER.writeValueAsString(resultMap);
    }

    private String handleConfirm(String commandId, Long tenantId, Long userId, String remark) throws Exception {
        log.info("[DigitalEmployee] 确认执行命令: commandId={}, user={}", commandId, userId);

        var auditLogOrchestrator = auditLogOrchestratorProvider.getIfAvailable();
        var executionEngine = executionEngineProvider.getIfAvailable();
        var objectMapper = objectMapperProvider.getIfAvailable();

        if (auditLogOrchestrator == null || executionEngine == null) {
            return errorJson("执行引擎未启用");
        }

        com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<
                com.fashion.supplychain.intelligence.entity.IntelligenceAuditLog> qw =
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<>();
        qw.eq("command_id", commandId)
          .eq("status", "PENDING_APPROVAL")
          .eq("tenant_id", tenantId);
        var pendingLog = auditLogOrchestrator.selectOne(qw);
        if (pendingLog == null) {
            return errorJson("待审批命令不存在或已处理: " + commandId);
        }

        com.fasterxml.jackson.databind.ObjectMapper mapper = objectMapper != null ?
                objectMapper : new com.fasterxml.jackson.databind.ObjectMapper();
        com.fashion.supplychain.intelligence.dto.ExecutableCommand originalCommand = mapper.readValue(
                pendingLog.getResultData(), com.fashion.supplychain.intelligence.dto.ExecutableCommand.class);

        pendingLog.setStatus("APPROVED");
        pendingLog.setApprovedBy(userId != null ? userId.toString() : null);
        pendingLog.setApprovedAt(java.time.LocalDateTime.now());
        pendingLog.setApprovalRemark(remark != null ? remark : "对话内确认执行");
        auditLogOrchestrator.updateById(pendingLog);

        ExecutionResult<?> result = executionEngine.execute(originalCommand, userId);

        Map<String, Object> resultMap = new LinkedHashMap<>();
        resultMap.put("success", result.isSuccess());
        resultMap.put("pending", false);
        resultMap.put("message", result.isSuccess() ?
                "已确认并执行：" + result.getMessage() :
                "执行失败：" + result.getErrorMessage());
        if (result.getData() != null) {
            resultMap.put("data", result.getData());
        }
        if (result.getAuditId() != null) {
            resultMap.put("auditId", result.getAuditId());
        }

        log.info("[DigitalEmployee] 确认执行结果: success={}, message={}",
                result.isSuccess(), result.getMessage());

        return MAPPER.writeValueAsString(resultMap);
    }

    private String handleReject(String commandId, Long tenantId, Long userId, String remark) throws Exception {
        log.info("[DigitalEmployee] 拒绝命令: commandId={}, user={}", commandId, userId);

        var auditLogOrchestrator = auditLogOrchestratorProvider.getIfAvailable();
        if (auditLogOrchestrator == null) {
            return errorJson("审计服务未启用");
        }

        com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<
                com.fashion.supplychain.intelligence.entity.IntelligenceAuditLog> qw =
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<>();
        qw.eq("command_id", commandId)
          .eq("status", "PENDING_APPROVAL")
          .eq("tenant_id", tenantId);
        var pendingLog = auditLogOrchestrator.selectOne(qw);
        if (pendingLog == null) {
            return errorJson("待审批命令不存在或已处理: " + commandId);
        }

        pendingLog.setStatus("REJECTED");
        pendingLog.setApprovedBy(userId != null ? userId.toString() : null);
        pendingLog.setApprovedAt(java.time.LocalDateTime.now());
        pendingLog.setApprovalRemark(remark != null ? remark : "对话内取消");
        auditLogOrchestrator.updateById(pendingLog);

        Map<String, Object> resultMap = new LinkedHashMap<>();
        resultMap.put("success", true);
        resultMap.put("pending", false);
        resultMap.put("rejected", true);
        resultMap.put("message", "已取消操作");

        log.info("[DigitalEmployee] 命令已拒绝: commandId={}", commandId);

        return MAPPER.writeValueAsString(resultMap);
    }

    private String handleMultiStep(String instruction, Long tenantId, Long userId,
                                   boolean rollbackOnFailure) throws Exception {
        log.info("[DigitalEmployee] 多步任务: instruction={}, rollbackOnFailure={}",
                instruction, rollbackOnFailure);

        var multiStepOrchestrator = multiStepOrchestratorProvider.getIfAvailable();
        if (multiStepOrchestrator == null) {
            return errorJson("多步任务服务未启用");
        }

        var result = multiStepOrchestrator.executeMultiStepTask(
                tenantId, userId, instruction, rollbackOnFailure);

        Map<String, Object> resultMap = new LinkedHashMap<>();
        resultMap.put("success", result.isAllSuccess());
        resultMap.put("multiStep", true);
        resultMap.put("taskId", result.getTaskId());
        resultMap.put("totalSteps", result.getTotalSteps());
        resultMap.put("completedSteps", result.getCompletedSteps());
        resultMap.put("failedSteps", result.getFailedSteps());
        resultMap.put("summary", result.getSummary());
        resultMap.put("message", result.getSummary());

        List<Map<String, Object>> stepList = new ArrayList<>();
        for (var step : result.getSteps()) {
            Map<String, Object> stepMap = new LinkedHashMap<>();
            stepMap.put("step", step.getStepIndex());
            stepMap.put("description", step.getStepDescription());
            stepMap.put("action", step.getAction());
            stepMap.put("success", step.isSuccess());
            stepMap.put("message", step.getMessage());
            if (step.getData() != null) {
                stepMap.put("data", step.getData());
            }
            stepList.add(stepMap);
        }
        resultMap.put("steps", stepList);

        if (result.getFailedSteps() > 0) {
            resultMap.put("nextStep",
                    "有步骤失败或需要审批。如需继续，请确认审批后告知我继续执行。");
        }

        log.info("[DigitalEmployee] 多步任务完成: taskId={}, {}/{} 成功",
                result.getTaskId(), result.getCompletedSteps(), result.getTotalSteps());

        return MAPPER.writeValueAsString(resultMap);
    }
}
