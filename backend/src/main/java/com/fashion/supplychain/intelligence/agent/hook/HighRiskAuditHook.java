package com.fashion.supplychain.intelligence.agent.hook;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 高风险工具审计钩子。
 * 对订单编辑、工资审批、裁剪创建、扫码撤回等敏感操作记录审计日志，
 * 便于事后追溯与安全审查。
 */
@Slf4j
@Component
public class HighRiskAuditHook implements ToolExecutionHook {

    @Override
    public boolean preToolUse(String toolName, String arguments) {
        if (AiAgentToolAccessService.isHighRisk(toolName)) {
            String userId = UserContext.userId();
            Long tenantId = UserContext.tenantId();
            log.warn("[HighRisk-Audit] 敏感工具调用 tool={}, user={}, tenant={}, args={}",
                    toolName, userId, tenantId, truncate(arguments, 500));
        }
        return true; // 当前仅审计，不拦截
    }

    @Override
    public void postToolUse(String toolName, String arguments, String result, long elapsedMs, boolean success) {
        if (AiAgentToolAccessService.isHighRisk(toolName)) {
            log.warn("[HighRisk-Audit] 敏感工具完成 tool={}, success={}, elapsed={}ms, resultLen={}",
                    toolName, success, elapsedMs, result == null ? 0 : result.length());
        }
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() <= maxLen ? s : s.substring(0, maxLen) + "...";
    }
}
