package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.agent.command.CompensableTool;
import com.fashion.supplychain.intelligence.agent.command.CompensationEntry;
import com.fashion.supplychain.intelligence.agent.command.CompensationResult;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentLinkedDeque;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class CompensatingTransactionManager {

    private static final Map<String, Deque<CompensationEntry>> SESSIONS = new LinkedHashMap<>();

    public synchronized void beginSession(String sessionId) {
        SESSIONS.put(sessionId, new ConcurrentLinkedDeque<>());
        log.info("[回滚框架] 会话开始 sessionId={}", sessionId);
    }

    public synchronized void recordExecution(String sessionId, String toolName,
                                              CompensableTool tool, Map<String, Object> execSnapshot) {
        Deque<CompensationEntry> stack = SESSIONS.get(sessionId);
        if (stack == null) {
            log.warn("[回滚框架] 记录执行失败：会话不存在 sessionId={}", sessionId);
            return;
        }
        CompensationEntry entry = CompensationEntry.builder()
                .toolName(toolName)
                .tool(tool)
                .executedAt(LocalDateTime.now())
                .execSnapshot(execSnapshot != null ? new LinkedHashMap<>(execSnapshot) : Collections.emptyMap())
                .build();
        stack.push(entry);
        log.info("[回滚框架] 记录执行 sessionId={} tool={}", sessionId, toolName);
    }

    public CompensationResult rollbackSession(String sessionId) {
        Deque<CompensationEntry> stack = SESSIONS.get(sessionId);
        if (stack == null || stack.isEmpty()) {
            log.info("[回滚框架] 无需回滚 sessionId={}", sessionId);
            return CompensationResult.empty();
        }

        List<String> rolledBack = new ArrayList<>();
        List<String> failed = new ArrayList<>();
        List<String> unrecoverable = new ArrayList<>();

        while (!stack.isEmpty()) {
            CompensationEntry entry = stack.pop();
            String toolName = entry.getToolName();
            CompensableTool tool = entry.getTool();

            if (tool == null) {
                unrecoverable.add(toolName);
                log.error("[回滚框架] 无法回滚（工具实例为null）sessionId={} tool={}", sessionId, toolName);
                continue;
            }

            try {
                CompensationResult singleResult = tool.compensate(entry.getExecSnapshot());
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

        SESSIONS.remove(sessionId);
        log.info("[回滚框架] 回滚完成 sessionId={} rolledBack={} failed={} unrecoverable={}",
                sessionId, rolledBack.size(), failed.size(), unrecoverable.size());

        return CompensationResult.builder()
                .success(failed.isEmpty() && unrecoverable.isEmpty())
                .rolledBack(rolledBack)
                .failed(failed)
                .unrecoverable(unrecoverable)
                .build();
    }

    public synchronized void endSession(String sessionId) {
        SESSIONS.remove(sessionId);
        log.info("[回滚框架] 会话结束 sessionId={}", sessionId);
    }

    public int activeSessionCount() {
        return SESSIONS.size();
    }
}
