package com.fashion.supplychain.intelligence.agent.hook;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AgentModeContext;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.intelligence.service.HighRiskAuditService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 高风险 AI 工具调用拦截 + 审计 Hook。
 *
 * <p>历史问题修复（2026-12 升级）：</p>
 * <ol>
 *   <li>原 {@code hashArgs()} 仅取参数前 32 字符 → 长参数前缀相同就误命中通过审批，
 *       已替换为 SHA-256 全量哈希（{@link HighRiskAuditService#sha256(String)}）。</li>
 *   <li>原 pending 状态存内存 {@code ConcurrentHashMap} → 多 Pod / 重启失效，
 *       已迁移到 Redis 共享存储 (60s TTL)。</li>
 *   <li>原本无任何审计落库 → 已在 {@link HighRiskAuditService} 中异步写入
 *       {@code t_intelligence_high_risk_audit} 表，全过程留痕（PENDING → APPROVED → EXECUTED）。</li>
 * </ol>
 */
@Slf4j
@Component
public class HighRiskAuditHook implements ToolExecutionHook {

    @Autowired
    private HighRiskAuditService auditService;

    @Override
    public boolean preToolUse(String toolName, String arguments) {
        if (!AiAgentToolAccessService.isHighRisk(toolName)) {
            return true;
        }
        // YOLO 模式：跳过高风险二次确认，直接放行（写操作幂等保护仍然生效）
        if (AgentModeContext.isYolo()) {
            String role = String.valueOf(UserContext.role());
            boolean isAdmin = role.contains("admin") || role.contains("ADMIN") || role.contains("manager")
                    || role.contains("supervisor") || role.contains("主管") || role.contains("管理员");
            if (isAdmin) {
                log.warn("[HighRisk-Audit] YOLO 模式（管理员），跳过二次确认直接执行 tool={}", toolName);
                return true;
            }
            log.warn("[HighRisk-Audit] YOLO 模式仅限管理员，当前用户非管理员，仍需二次确认 tool={}", toolName);
        }
        String userId = UserContext.userId();
        String userName = UserContext.username();
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 1) 命中 Redis pending → 视为已批准，放行执行
        if (auditService.isApproved(userId, toolName, arguments)) {
            log.warn("[HighRisk-Audit] 二次确认通过 tool={}, user={}, tenant={}", toolName, userId, tenantId);
            // 二次确认这一次也单独落一条 APPROVED → EXECUTED 记录，保持每次执行均可审计
            Long auditId = auditService.registerPending(userId, userName, toolName, arguments);
            auditService.markApproved(auditId);
            return true;
        }

        // 2) 首次调用 → 登记 PENDING + Redis 标记 → 拦截让 AI 询问用户
        Long auditId = auditService.registerPending(userId, userName, toolName, arguments);
        log.warn("[HighRisk-Audit] 高风险工具需二次确认 auditId={}, tool={}, user={}, tenant={}",
                auditId, toolName, userId, tenantId);
        return false;
    }

    @Override
    public void postToolUse(String toolName, String arguments, String result, long elapsedMs, boolean success) {
        if (!AiAgentToolAccessService.isHighRisk(toolName)) {
            return;
        }
        Long auditId = auditService.popCurrentAuditId();
        log.warn("[HighRisk-Audit] 敏感工具完成 auditId={}, tool={}, success={}, elapsed={}ms",
                auditId, toolName, success, elapsedMs);
        auditService.markExecuted(auditId, success, result, elapsedMs, success ? null : result);
    }
}
