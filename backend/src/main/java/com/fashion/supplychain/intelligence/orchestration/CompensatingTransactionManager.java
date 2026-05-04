package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.agent.command.CompensableTool;
import com.fashion.supplychain.intelligence.agent.command.CompensationEntry;
import com.fashion.supplychain.intelligence.agent.command.CompensationResult;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class CompensatingTransactionManager {

    private static final long SESSION_TTL_MINUTES = 30;

    private record SessionEntry(Deque<CompensationEntry> stack, LocalDateTime createdAt) {}

    private final ConcurrentHashMap<String, SessionEntry> SESSIONS = new ConcurrentHashMap<>();

    public void beginSession(String sessionId) {
        SESSIONS.put(sessionId, new SessionEntry(new ConcurrentLinkedDeque<>(), LocalDateTime.now()));
        log.info("[回滚框架] 会话开始 sessionId={}", sessionId);
    }

    public void recordExecution(String sessionId, String toolName,
                                CompensableTool tool, Map<String, Object> execSnapshot) {
        SessionEntry entry = SESSIONS.get(sessionId);
        if (entry == null) {
            log.warn("[回滚框架] 记录执行失败：会话不存在 sessionId={}", sessionId);
            return;
        }
        CompensationEntry ce = CompensationEntry.builder()
                .toolName(toolName)
                .tool(tool)
                .executedAt(LocalDateTime.now())
                .execSnapshot(execSnapshot != null ? new LinkedHashMap<>(execSnapshot) : Collections.emptyMap())
                .build();
        entry.stack().push(ce);
        log.info("[回滚框架] 记录执行 sessionId={} tool={}", sessionId, toolName);
    }

    public CompensationResult rollbackSession(String sessionId) {
        SessionEntry entry = SESSIONS.remove(sessionId);
        if (entry == null || entry.stack().isEmpty()) {
            log.info("[回滚框架] 无需回滚 sessionId={}", sessionId);
            return CompensationResult.empty();
        }
        Deque<CompensationEntry> stack = entry.stack();

        List<String> rolledBack = new ArrayList<>();
        List<String> failed = new ArrayList<>();
        List<String> unrecoverable = new ArrayList<>();

        while (!stack.isEmpty()) {
            CompensationEntry ce = stack.pop();
            String toolName = ce.getToolName();
            CompensableTool tool = ce.getTool();

            if (tool == null) {
                unrecoverable.add(toolName);
                log.error("[回滚框架] 无法回滚（工具实例为null）sessionId={} tool={}", sessionId, toolName);
                continue;
            }

            try {
                CompensationResult singleResult = tool.compensate(ce.getExecSnapshot());
                if (singleResult.isSuccess()) {
                    rolledBack.add(toolName);
                    log.info("[回滚框架] 回滚成功 sessionId={} tool={}", sessionId, toolName);
                } else {
                    failed.add(toolName);
                    log.error("[回滚框架] 回滚失败 sessionId={} tool={} reason={}",
                            sessionId, toolName, singleResult.getError());
                }
            } catch (Exception e) {
                failed.add(toolName);
                log.error("[回滚框架] 回滚异常 sessionId={} tool={}", sessionId, toolName, e);
            }
        }

        log.info("[回滚框架] 回滚完成 sessionId={} rolledBack={} failed={} unrecoverable={}",
                sessionId, rolledBack.size(), failed.size(), unrecoverable.size());

        return CompensationResult.builder()
                .success(failed.isEmpty() && unrecoverable.isEmpty())
                .rolledBack(rolledBack)
                .failed(failed)
                .unrecoverable(unrecoverable)
                .build();
    }

    public void endSession(String sessionId) {
        SESSIONS.remove(sessionId);
        log.info("[回滚框架] 会话结束 sessionId={}", sessionId);
    }

    public int activeSessionCount() {
        return SESSIONS.size();
    }

    @Scheduled(fixedRate = 600_000)
    public void evictExpiredSessions() {
        LocalDateTime cutoff = LocalDateTime.now().minusMinutes(SESSION_TTL_MINUTES);
        int removed = 0;
        for (Map.Entry<String, SessionEntry> e : SESSIONS.entrySet()) {
            if (e.getValue().createdAt().isBefore(cutoff)) {
                SESSIONS.remove(e.getKey());
                removed++;
            }
        }
        if (removed > 0) {
            log.warn("[回滚框架] 清理过期会话 {} 个（TTL={}分钟）", removed, SESSION_TTL_MINUTES);
        }
    }
}
