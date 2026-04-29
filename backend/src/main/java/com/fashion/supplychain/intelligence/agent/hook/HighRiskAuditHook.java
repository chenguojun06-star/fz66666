package com.fashion.supplychain.intelligence.agent.hook;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AgentModeContext;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService.ConfirmLevel;
import com.fashion.supplychain.intelligence.service.HighRiskAuditService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 统一操作确认 Hook — 双重确认机制的核心。
 *
 * <p>确认层级：</p>
 * <ul>
 *   <li>{@link ConfirmLevel#HIGH_RISK}：高风险写操作 → 展示详细预览+风险提示+审计落库</li>
 *   <li>{@link ConfirmLevel#WRITE}：普通写操作 → 展示简洁预览+轻量确认</li>
 *   <li>{@link ConfirmLevel#READ_ONLY}：只读查询 → 直接放行</li>
 * </ul>
 *
 * <p>双重确认流程：</p>
 * <ol>
 *   <li>首次调用 → 登记 PENDING + Redis 标记 → 拦截，AI 向用户展示执行预览</li>
 *   <li>用户确认 → AI 用相同参数再次调用 → 命中 Redis pending → 放行执行</li>
 * </ol>
 *
 * <p>历史问题修复（2026-12 升级）：</p>
 * <ol>
 *   <li>原 {@code hashArgs()} 仅取参数前 32 字符 → 已替换为 SHA-256 全量哈希</li>
 *   <li>原 pending 状态存内存 ConcurrentHashMap → 已迁移到 Redis 共享存储 (60s TTL)</li>
 *   <li>原本无任何审计落库 → 已在 {@link HighRiskAuditService} 中异步写入审计表</li>
 * </ol>
 */
@Slf4j
@Component
public class HighRiskAuditHook implements ToolExecutionHook {

    @Autowired
    private HighRiskAuditService auditService;

    @Override
    public boolean preToolUse(String toolName, String arguments) {
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
        if (level != ConfirmLevel.HIGH_RISK) {
            return;
        }
        Long auditId = auditService.popCurrentAuditId();
        log.info("[OperationConfirm] 高风险操作完成 auditId={}, tool={}, success={}, elapsed={}ms",
                auditId, toolName, success, elapsedMs);
        auditService.markExecuted(auditId, success, result, elapsedMs, success ? null : result);
    }
}
