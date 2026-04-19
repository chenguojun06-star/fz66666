package com.fashion.supplychain.intelligence.helper;

import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.agent.hook.ToolExecutionHook;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.orchestration.AiAgentTraceOrchestrator;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.intelligence.service.AiAgentMetricsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Slf4j
@Component
public class AiAgentToolExecHelper {

    private static final int STUCK_MAX_REPEAT = 3;

    @Autowired private AiAgentTraceOrchestrator aiAgentTraceOrchestrator;
    @Autowired private AiAgentEvidenceHelper evidenceHelper;
    @Autowired private AiAgentToolAccessService aiAgentToolAccessService;
    @Autowired private AiAgentMetricsService metricsService;
    @Autowired private List<AgentTool> registeredTools;
    @Autowired(required = false) private List<ToolExecutionHook> toolHooks;

    private Map<String, AgentTool> toolMap;

    private final ExecutorService toolExecutor = new ThreadPoolExecutor(
            8, 16, 60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(128),
            new ThreadFactory() {
                private final AtomicInteger seq = new AtomicInteger(1);
                @Override
                public Thread newThread(Runnable r) {
                    Thread t = new Thread(r, "ai-tool-" + seq.getAndIncrement());
                    t.setDaemon(true);
                    return t;
                }
            },
            new ThreadPoolExecutor.CallerRunsPolicy());

    @PostConstruct
    public void init() {
        toolMap = new HashMap<>();
        if (registeredTools != null) {
            for (AgentTool tool : registeredTools) {
                toolMap.put(tool.getName(), tool);
                log.info("[AiAgent] 已注册工具: {}", tool.getName());
            }
        }
    }

    @PreDestroy
    public void shutdown() {
        toolExecutor.shutdown();
        try {
            if (!toolExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                log.warn("[AiAgent] 工具线程池 5s 内未关闭，强制终止");
                toolExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            toolExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    public Map<String, AgentTool> getToolMap() {
        return toolMap;
    }

    public Map<String, AgentTool> toToolLookup(List<AgentTool> visibleTools) {
        return visibleTools.stream().collect(Collectors.toMap(AgentTool::getName, tool -> tool));
    }

    public String buildUnavailableToolResult(String toolName) {
        if (toolMap.containsKey(toolName) && !aiAgentToolAccessService.canUseTool(toolName)) {
            return "{\"error\":\"当前角色无权使用工具: " + toolName + "\"}";
        }
        return "{\"error\":\"未知工具: " + toolName + "\"}";
    }

    /** 工具执行结果记录（内部数据结构） */
    public static class ToolExecRecord {
        public final String toolCallId;
        public final String toolName;
        public final String args;
        public final String rawResult;
        public final String evidence;
        public final long elapsedMs;

        public ToolExecRecord(String toolCallId, String toolName, String args,
                       String rawResult, String evidence, long elapsedMs) {
            this.toolCallId = toolCallId;
            this.toolName = toolName;
            this.args = args;
            this.rawResult = rawResult;
            this.evidence = evidence;
            this.elapsedMs = elapsedMs;
        }
    }

    public List<ToolExecRecord> executeToolsConcurrently(
            List<AiToolCall> toolCalls,
            Map<String, AgentTool> visibleToolMap,
            String commandId,
            Map<String, ToolExecRecord> toolResultCache) {

        if (toolCalls.size() == 1) {
            AiToolCall tc = toolCalls.get(0);
            String cacheKey = tc.getFunction().getName() + ":" + tc.getFunction().getArguments();
            ToolExecRecord cached = toolResultCache.get(cacheKey);
            if (cached != null) {
                log.info("[AiAgent-Cache] 工具缓存命中: {}", tc.getFunction().getName());
                return List.of(new ToolExecRecord(tc.getId(), cached.toolName, cached.args,
                        cached.rawResult, cached.evidence, 0));
            }
            ToolExecRecord rec = executeSingleTool(tc, visibleToolMap, commandId);
            toolResultCache.put(cacheKey, rec);
            return List.of(rec);
        }

        List<CompletableFuture<ToolExecRecord>> futures = new ArrayList<>();
        for (AiToolCall toolCall : toolCalls) {
            String cacheKey = toolCall.getFunction().getName() + ":" + toolCall.getFunction().getArguments();
            ToolExecRecord cached = toolResultCache.get(cacheKey);
            if (cached != null) {
                log.info("[AiAgent-Cache] 工具缓存命中: {}", toolCall.getFunction().getName());
                ToolExecRecord cachedCopy = new ToolExecRecord(toolCall.getId(), cached.toolName,
                        cached.args, cached.rawResult, cached.evidence, 0);
                futures.add(CompletableFuture.completedFuture(cachedCopy));
            } else {
                futures.add(CompletableFuture.supplyAsync(
                        () -> executeSingleTool(toolCall, visibleToolMap, commandId),
                        toolExecutor));
            }
        }

        List<ToolExecRecord> records = new ArrayList<>();
        for (CompletableFuture<ToolExecRecord> future : futures) {
            try {
                ToolExecRecord rec = future.join();
                records.add(rec);
                String cacheKey = rec.toolName + ":" + rec.args;
                toolResultCache.putIfAbsent(cacheKey, rec);
            } catch (Exception e) {
                log.error("[AiAgent] 并发工具执行异常: {}", e.getMessage());
                records.add(new ToolExecRecord("err", "unknown", "",
                        "{\"error\":\"工具执行异常: " + e.getMessage() + "\"}",
                        "【工具证据】\n- 状态: 异常\n- 错误: " + e.getMessage(), 0));
            }
        }
        return records;
    }

    private ToolExecRecord executeSingleTool(AiToolCall toolCall,
                                             Map<String, AgentTool> visibleToolMap,
                                             String commandId) {
        String toolName = toolCall.getFunction().getName();
        String arguments = toolCall.getFunction().getArguments();
        String toolCallId = toolCall.getId();
        long start = System.currentTimeMillis();
        String rawResult;
        boolean success = false;

        if (toolHooks != null) {
            for (ToolExecutionHook hook : toolHooks) {
                try {
                    if (!hook.preToolUse(toolName, arguments)) {
                        log.info("[AiAgent] Hook 拦截工具调用: {}", toolName);
                        rawResult = "{\"success\":false,\"needsConfirmation\":true,\"error\":\"该操作属于高风险操作，需要二次确认。请向用户确认是否要执行此操作，如果用户确认，请使用完全相同的参数再次调用该工具。\"}";
                        long elapsed = System.currentTimeMillis() - start;
                        return new ToolExecRecord(toolCallId, toolName, arguments, rawResult,
                                evidenceHelper.buildToolEvidenceMessage(toolName, rawResult), elapsed);
                    }
                } catch (Exception e) {
                    log.warn("[AiAgent] preToolUse hook 异常: {}", e.getMessage());
                }
            }
        }

        AgentTool tool = visibleToolMap.get(toolName);
        if (tool != null) {
            try {
                rawResult = tool.execute(arguments);
                success = true;
            } catch (Exception e) {
                if (isTransientError(e)) {
                    log.warn("[AiAgent] 工具瞬态异常，退避后重试: tool={}, error={}", toolName, e.getMessage());
                    try {
                        Thread.sleep(300 + (long)(Math.random() * 200));
                        rawResult = tool.execute(arguments);
                        success = true;
                    } catch (Exception retryEx) {
                        log.error("[AiAgent] 工具重试仍失败: tool={}, error={}", toolName, retryEx.getMessage());
                        rawResult = "{\"error\":\"工具执行异常(重试后): " + retryEx.getMessage() + "\"}";
                    }
                } else {
                    log.error("[AiAgent] 工具执行异常: tool={}, error={}", toolName, e.getMessage());
                    rawResult = "{\"error\":\"工具执行异常: " + e.getMessage() + "\"}";
                }
            }
        } else {
            rawResult = buildUnavailableToolResult(toolName);
        }

        long elapsed = System.currentTimeMillis() - start;

        if (toolHooks != null) {
            for (ToolExecutionHook hook : toolHooks) {
                try {
                    hook.postToolUse(toolName, arguments, rawResult, elapsed, success);
                } catch (Exception e) {
                    log.warn("[AiAgent] postToolUse hook 异常: {}", e.getMessage());
                }
            }
        }

        try {
            aiAgentTraceOrchestrator.logToolCall(commandId, toolName, arguments, rawResult, elapsed, success);
        } catch (Exception e) {
            log.debug("[AiAgent] trace logToolCall 失败: {}", e.getMessage());
        }

        try {
            metricsService.recordToolCall(toolName, elapsed, success);
        } catch (Exception e) {
            log.debug("[AiAgent] metrics recordToolCall 失败: {}", e.getMessage());
        }

        String evidence = evidenceHelper.buildToolEvidenceMessage(toolName, rawResult);
        return new ToolExecRecord(toolCallId, toolName, arguments, rawResult, evidence, elapsed);
    }

    private boolean isTransientError(Exception e) {
        String msg = e.getMessage();
        if (msg == null) return false;
        String lower = msg.toLowerCase();
        return lower.contains("timeout") || lower.contains("timed out")
            || lower.contains("connection reset") || lower.contains("connection refused")
            || lower.contains("429") || lower.contains("too many requests")
            || lower.contains("503") || lower.contains("service unavailable")
            || lower.contains("502") || lower.contains("bad gateway");
    }

    public String buildStuckSignature(AiToolCall toolCall) {
        String name = toolCall.getFunction() == null ? "?" : toolCall.getFunction().getName();
        String args = toolCall.getFunction() == null ? "" : String.valueOf(
                toolCall.getFunction().getArguments() == null ? "" : toolCall.getFunction().getArguments());
        return name + "|" + args.hashCode();
    }

    public boolean isStuck(List<String> signatures) {
        if (signatures.size() < STUCK_MAX_REPEAT) {
            return false;
        }
        int sz = signatures.size();
        String last = signatures.get(sz - 1);
        boolean exactRepeat = true;
        for (int i = sz - STUCK_MAX_REPEAT; i < sz; i++) {
            if (!last.equals(signatures.get(i))) { exactRepeat = false; break; }
        }
        if (exactRepeat) return true;

        if (sz >= 4) {
            String lastTool = signatures.get(sz - 1).split("\\|", 2)[0];
            boolean sameToolRepeat = true;
            for (int i = sz - 4; i < sz; i++) {
                if (!lastTool.equals(signatures.get(i).split("\\|", 2)[0])) {
                    sameToolRepeat = false; break;
                }
            }
            if (sameToolRepeat) {
                log.warn("[AiAgent] Stuck: 同一工具 {} 连续调用 4 次（参数不同）", lastTool);
                return true;
            }
        }

        if (sz >= 4) {
            String a = signatures.get(sz - 4);
            String b = signatures.get(sz - 3);
            if (!a.equals(b) && a.equals(signatures.get(sz - 2)) && b.equals(signatures.get(sz - 1))) {
                log.warn("[AiAgent] Stuck: A-B-A-B 振荡检测 ({} ↔ {})", a, b);
                return true;
            }
        }
        return false;
    }
}
