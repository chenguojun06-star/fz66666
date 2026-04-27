package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AgentMode;
import com.fashion.supplychain.intelligence.agent.AgentModeContext;
import com.fashion.supplychain.intelligence.agent.loop.AgentLoopContext;
import com.fashion.supplychain.intelligence.agent.loop.AgentLoopContextBuilder;
import com.fashion.supplychain.intelligence.agent.loop.AgentLoopEngine;
import com.fashion.supplychain.intelligence.agent.loop.StreamingAgentLoopCallback;
import com.fashion.supplychain.intelligence.agent.loop.SyncAgentLoopCallback;
import com.fashion.supplychain.intelligence.helper.AiAgentMemoryHelper;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Collections;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class AiAgentOrchestrator {

    @Autowired private AgentLoopContextBuilder contextBuilder;
    @Autowired private AgentLoopEngine loopEngine;
    @Autowired private AiAgentMemoryHelper memoryHelper;
    @Autowired private DecisionCardOrchestrator decisionCardOrchestrator;
    @Autowired private LongTermMemoryOrchestrator longTermMemoryOrchestrator;

    private final ThreadLocal<String> lastCommandIdHolder = new ThreadLocal<>();
    private final ThreadLocal<List<AiAgentToolExecHelper.ToolExecRecord>> lastToolRecordsHolder = new ThreadLocal<>();

    private static final long CACHE_TTL_MS = TimeUnit.MINUTES.toMillis(5);
    private static final int CACHE_MAX_SIZE = 200;
    private final ConcurrentHashMap<String, CacheEntry> queryCache = new ConcurrentHashMap<>();

    private static class CacheEntry {
        final String result;
        final long createdAt;
        CacheEntry(String result) { this.result = result; this.createdAt = System.currentTimeMillis(); }
        boolean isExpired() { return System.currentTimeMillis() - createdAt > CACHE_TTL_MS; }
    }

    public Result<String> executeAgent(String userMessage) {
        return executeAgent(userMessage, null);
    }

    public Result<String> executeAgent(String userMessage, String pageContext) {
        if (!contextBuilder.isModelEnabled()) {
            return Result.fail("智能服务暂未配置或不可用");
        }

        AgentLoopContext ctx = contextBuilder.build(userMessage, pageContext);
        lastCommandIdHolder.set(ctx.getCommandId());

        try {
            SyncAgentLoopCallback cb = new SyncAgentLoopCallback(
                    ctx, memoryHelper, decisionCardOrchestrator, longTermMemoryOrchestrator);
            String loopResult = loopEngine.run(ctx, cb);

            if ("stuck_detected".equals(loopResult)) {
                return Result.success("抱歉，我在处理过程中遇到了循环，已自动终止。请尝试换一种方式描述您的需求。");
            }
            if ("max_iterations_exceeded".equals(loopResult)) {
                return Result.fail("对话轮数超过限制 (" + ctx.getMaxIterations() + ")，可能陷入了死循环。");
            }
            if ("plan_mode".equals(loopResult)) {
                return Result.success(cb.getFinalContent());
            }

            lastToolRecordsHolder.set(cb.getExecRecords());
            String content = cb.getFinalContent();
            if (content == null) {
                return Result.fail("推理服务暂时不可用");
            }
            return Result.success(content);
        } finally {
            lastCommandIdHolder.remove();
            lastToolRecordsHolder.remove();
            AgentModeContext.clear();
        }
    }

    public Result<String> executeAgent(String userMessage, String pageContext, AgentMode mode) {
        AgentModeContext.set(mode);
        return executeAgent(userMessage, pageContext);
    }

    public void executeAgentStreaming(String userMessage, String pageContext, AgentMode mode, SseEmitter emitter) {
        AgentModeContext.set(mode);
        executeAgentStreaming(userMessage, pageContext, emitter);
    }

    public void executeAgentStreaming(String userMessage, String pageContext, SseEmitter emitter) {
        long requestStartAt = System.currentTimeMillis();
        ScheduledExecutorService heartbeat = null;
        try {
            if (!contextBuilder.isModelEnabled()) {
                emitSse(emitter, "error", java.util.Map.of("message", "智能服务暂未配置或不可用"));
                emitSse(emitter, "done", java.util.Map.of());
                emitter.complete();
                return;
            }

            String cacheKey = UserContext.tenantId() + ":" + UserContext.userId() + ":" + userMessage;
            CacheEntry cached = queryCache.get(cacheKey);
            if (cached != null && !cached.isExpired()) {
                log.info("[AiAgent-Stream] 命中查询缓存，直接返回 ({}字符)", cached.result.length());
                AgentLoopContext ctx = contextBuilder.build(userMessage, pageContext);
                emitSse(emitter, "answer", java.util.Map.of("content", cached.result, "commandId", ctx.getCommandId()));
                emitSse(emitter, "done", java.util.Map.of());
                emitter.complete();
                return;
            }
            if (queryCache.size() > CACHE_MAX_SIZE) {
                queryCache.entrySet().removeIf(e -> e.getValue().isExpired());
            }

            heartbeat = startHeartbeat(emitter, 15);

            AgentLoopContext ctx = contextBuilder.build(userMessage, pageContext);
            StreamingAgentLoopCallback cb = new StreamingAgentLoopCallback(
                    emitter, ctx, memoryHelper, decisionCardOrchestrator, longTermMemoryOrchestrator);

            String loopResult = loopEngine.run(ctx, cb);

            if ("plan_mode".equals(loopResult) || "stuck_detected".equals(loopResult)
                    || "token_budget_exceeded".equals(loopResult) || "max_iterations_exceeded".equals(loopResult)) {
                // Callback already handled SSE events
            } else if (cb.getFinalContent() != null && cb.getExecRecords().size() <= 2) {
                queryCache.put(cacheKey, new CacheEntry(deduplicateAnswer(cb.getFinalContent())));
            }

        } catch (Exception e) {
            log.error("[AiAgent-Stream] 流式执行异常", e);
            try {
                emitSse(emitter, "error", java.util.Map.of("message", "系统异常: " + e.getMessage()));
                emitSse(emitter, "done", java.util.Map.of());
                emitter.complete();
            } catch (Exception ex) {
                log.debug("[AiAgent-Stream] SSE完成异常: {}", ex.getMessage());
                emitter.completeWithError(e);
            }
        } finally {
            if (heartbeat != null) {
                heartbeat.shutdownNow();
            }
            lastCommandIdHolder.remove();
            lastToolRecordsHolder.remove();
            AgentModeContext.clear();
        }
    }

    public void saveCurrentConversationToMemory() {
        String userId = UserContext.userId();
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        memoryHelper.saveCurrentConversationToMemory(userId, tenantId);
    }

    public String consumeLastCommandId() {
        String commandId = lastCommandIdHolder.get();
        lastCommandIdHolder.remove();
        return commandId;
    }

    public List<AiAgentToolExecHelper.ToolExecRecord> consumeLastToolRecords() {
        List<AiAgentToolExecHelper.ToolExecRecord> records = lastToolRecordsHolder.get();
        lastToolRecordsHolder.remove();
        return records != null ? records : Collections.emptyList();
    }

    private void emitSse(SseEmitter emitter, String eventName, java.util.Map<String, Object> data) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            emitter.send(SseEmitter.event().name(eventName).data(mapper.writeValueAsString(data)));
        } catch (Exception e) {
            log.warn("[AiAgent-Stream] 发送SSE事件失败: event={}, error={}", eventName, e.getMessage());
        }
    }

    private ScheduledExecutorService startHeartbeat(SseEmitter emitter, int intervalSeconds) {
        ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "sse-hb-" + emitter.hashCode());
            t.setDaemon(true);
            return t;
        });
        scheduler.scheduleAtFixedRate(() -> {
            try {
                emitter.send(SseEmitter.event().comment("heartbeat " + System.currentTimeMillis()));
            } catch (Exception e) {
                log.debug("[AiAgent-Stream] 心跳发送失败，连接可能已断开");
                scheduler.shutdownNow();
            }
        }, intervalSeconds, intervalSeconds, TimeUnit.SECONDS);
        return scheduler;
    }

    private String deduplicateAnswer(String content) {
        if (content == null || content.length() < 20) return content;
        String[] paragraphs = content.split("\n\n+");
        if (paragraphs.length < 2) return content;
        StringBuilder sb = new StringBuilder();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (String p : paragraphs) {
            String trimmed = p.trim();
            if (trimmed.isEmpty()) continue;
            String normalized = trimmed.replaceAll("[\\s\\p{Punct}]", "");
            if (normalized.length() < 10 || seen.add(normalized)) {
                if (sb.length() > 0) sb.append("\n\n");
                sb.append(trimmed);
            }
        }
        return sb.toString();
    }
}
