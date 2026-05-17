package com.fashion.supplychain.intelligence.agent.hook;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AgentModeContext;
import com.fashion.supplychain.intelligence.orchestration.TaskTrackerOrchestrator;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService.ConfirmLevel;
import com.fashion.supplychain.intelligence.service.HighRiskAuditService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Set;

@Slf4j
@Component
public class HighRiskAuditHook implements ToolExecutionHook {

    private static final Set<String> SAFE_AUTO_EXECUTE = Set.of(
            "tool_order_contact_urge",
            "tool_production_exception",
            "tool_material_quality_issue"
    );

    @Autowired
    private HighRiskAuditService auditService;

    @Autowired(required = false)
    private TaskTrackerOrchestrator taskTracker;

    @Override
    public boolean preToolUse(String toolName, String arguments) {
        if (SAFE_AUTO_EXECUTE.contains(toolName)) {
            log.debug("[OperationConfirm] 安全自动执行 tool={}", toolName);
            return true;
        }

        ConfirmLevel level = AiAgentToolAccessService.getConfirmLevel(toolName);

        if (level == ConfirmLevel.READ_ONLY) {
            return true;
        }

        if (AgentModeContext.isYolo()) {
            String role = String.valueOf(UserContext.role());
            boolean isAdmin = role.contains("admin") || role.contains("ADMIN") || role.contains("manager")
                    || role.contains("supervisor") || role.contains("主管") || role.contains("管理员");
            if (isAdmin) {
                log.warn("[OperationConfirm] YOLO 模式（管理员），跳过确认直接执行 tool={}", toolName);
                return true;
            }
            log.warn("[OperationConfirm] YOLO 模式仅限管理员，当前用户非管理员，仍需确认 tool={}", toolName);
        }

        String userId = UserContext.userId();
        String userName = UserContext.username();
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        if (auditService.isApproved(userId, toolName, arguments)) {
            log.info("[OperationConfirm] 用户已确认，放行执行 tool={}, user={}, tenant={}, level={}",
                    toolName, userId, tenantId, level);
            if (level == ConfirmLevel.HIGH_RISK) {
                Long auditId = auditService.registerPending(userId, userName, toolName, arguments);
                auditService.markApproved(auditId);
            }
            return true;
        }

        if (level == ConfirmLevel.HIGH_RISK) {
            Long auditId = auditService.registerPending(userId, userName, toolName, arguments);
            log.warn("[OperationConfirm] 高风险操作需确认 auditId={}, tool={}, user={}, tenant={}",
                    auditId, toolName, userId, tenantId);
        } else {
            auditService.registerPending(userId, userName, toolName, arguments);
            log.info("[OperationConfirm] 写操作需确认 tool={}, user={}, tenant={}",
                    toolName, userId, tenantId);
        }
        return false;
    }

    @Override
    public void postToolUse(String toolName, String arguments, String result, long elapsedMs, boolean success) {
        ConfirmLevel level = AiAgentToolAccessService.getConfirmLevel(toolName);

        if (success && taskTracker != null) {
            boolean isWrite = SAFE_AUTO_EXECUTE.contains(toolName)
                    || level == ConfirmLevel.HIGH_RISK
                    || level == ConfirmLevel.WRITE;
            if (isWrite) {
                try {
                    String taskType = level == ConfirmLevel.HIGH_RISK ? "ACTION" : "NOTIFY";
                    taskTracker.recordTask(toolName, taskType, resolveTargetType(toolName),
                            extractSummary(arguments), extractSummary(result),
                            UserContext.username());
                } catch (Exception e) {
                    log.debug("[TaskTracker] 记录任务失败: {}", e.getMessage());
                }
            }
        }

        if (level != ConfirmLevel.HIGH_RISK) {
            return;
        }
        Long auditId = auditService.popCurrentAuditId();
        log.info("[OperationConfirm] 高风险操作完成 auditId={}, tool={}, success={}, elapsed={}ms",
                auditId, toolName, success, elapsedMs);
        auditService.markExecuted(auditId, success, result, elapsedMs, success ? null : result);
    }

    private String resolveTargetType(String toolName) {
        if (toolName.contains("order")) return "ORDER";
        if (toolName.contains("factory")) return "FACTORY";
        if (toolName.contains("material")) return "MATERIAL";
        if (toolName.contains("sample")) return "SAMPLE";
        if (toolName.contains("production")) return "ORDER";
        return "SYSTEM";
    }

    private String extractSummary(String jsonOrText) {
        if (jsonOrText == null || jsonOrText.length() <= 100) return jsonOrText;
        return jsonOrText.substring(0, 100);
    }
}