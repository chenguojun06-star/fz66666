package com.fashion.supplychain.intelligence.agent.hook;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class HighRiskAuditHook implements ToolExecutionHook {

    private static final long CONFIRM_WINDOW_MS = 60_000;
    private final Map<String, Long> pendingConfirmations = new ConcurrentHashMap<>();

    @Override
    public boolean preToolUse(String toolName, String arguments) {
        if (!AiAgentToolAccessService.isHighRisk(toolName)) {
            return true;
        }
        String userId = UserContext.userId();
        Long tenantId = UserContext.tenantId();
        String confirmKey = userId + ":" + toolName + ":" + hashArgs(arguments);
        Long pendingAt = pendingConfirmations.get(confirmKey);

        if (pendingAt != null && (System.currentTimeMillis() - pendingAt) < CONFIRM_WINDOW_MS) {
            pendingConfirmations.remove(confirmKey);
            log.warn("[HighRisk-Audit] 二次确认通过，执行高风险工具 tool={}, user={}, tenant={}",
                    toolName, userId, tenantId);
            return true;
        }

        pendingConfirmations.put(confirmKey, System.currentTimeMillis());
        log.warn("[HighRisk-Audit] 高风险工具需二次确认 tool={}, user={}, tenant={}, args={}",
                toolName, userId, tenantId, truncate(arguments, 500));
        return false;
    }

    @Override
    public void postToolUse(String toolName, String arguments, String result, long elapsedMs, boolean success) {
        if (AiAgentToolAccessService.isHighRisk(toolName)) {
            log.warn("[HighRisk-Audit] 敏感工具完成 tool={}, success={}, elapsed={}ms, resultLen={}",
                    toolName, success, elapsedMs, result == null ? 0 : result.length());
        }
    }

    public boolean hasPendingConfirmation(String userId, String toolName, String arguments) {
        String confirmKey = userId + ":" + toolName + ":" + hashArgs(arguments);
        Long pendingAt = pendingConfirmations.get(confirmKey);
        return pendingAt != null && (System.currentTimeMillis() - pendingAt) < CONFIRM_WINDOW_MS;
    }

    private String hashArgs(String arguments) {
        if (arguments == null || arguments.length() < 32) return arguments != null ? arguments : "";
        return arguments.substring(0, 32);
    }

    private String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() <= maxLen ? s : s.substring(0, maxLen) + "...";
    }
}
