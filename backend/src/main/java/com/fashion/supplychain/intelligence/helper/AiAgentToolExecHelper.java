package com.fashion.supplychain.intelligence.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.agent.hook.ToolExecutionHook;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.orchestration.AiAgentTraceOrchestrator;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService.ConfirmLevel;
import com.fashion.supplychain.intelligence.service.AiAgentMetricsService;
import com.fashion.supplychain.intelligence.service.AiAgentIdempotencyService;
import com.fashion.supplychain.intelligence.service.CostExplosionGuard;
import com.fashion.supplychain.intelligence.service.ToolResultCacheService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

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
@Lazy
public class AiAgentToolExecHelper {

    private static final int STUCK_MAX_REPEAT = 3;

    @Value("${xiaoyun.agent.tool-executor.core-pool-size:16}")
    private int toolCorePoolSize;
    @Value("${xiaoyun.agent.tool-executor.max-pool-size:32}")
    private int toolMaxPoolSize;
    @Value("${xiaoyun.agent.tool-executor.queue-capacity:256}")
    private int toolQueueCapacity;

    @Autowired private AiAgentTraceOrchestrator aiAgentTraceOrchestrator;
    @Autowired private AiAgentEvidenceHelper evidenceHelper;
    @Autowired private AiAgentToolAccessService aiAgentToolAccessService;
    @Autowired private AiAgentMetricsService metricsService;
    @Autowired private AiAgentIdempotencyService idempotencyService;
    @Autowired private List<AgentTool> registeredTools;
    @Autowired(required = false) private List<ToolExecutionHook> toolHooks;
    @Autowired(required = false) private CostExplosionGuard costExplosionGuard;
    @Autowired(required = false) private ToolResultCacheService toolResultCacheService;

    private Map<String, AgentTool> toolMap;

    private ExecutorService toolExecutor;

    @PostConstruct
    public void init() {
        toolExecutor = new ThreadPoolExecutor(
                toolCorePoolSize, toolMaxPoolSize, 60L, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(toolQueueCapacity),
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
        log.info("[AiAgent-Config] 工具执行线程池初始化: core={}, max={}, queue={}",
                toolCorePoolSize, toolMaxPoolSize, toolQueueCapacity);

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
                        UserContext.wrapSupplier(() -> executeSingleTool(toolCall, visibleToolMap, commandId)),
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

    /**
     * 流式工具执行：每个工具完成后立即回调，不等全部完成。
     * 提升用户体验：让用户看到实时进度，而不是最后一起显示。
     */
    public List<ToolExecRecord> executeToolsWithStreaming(
            List<AiToolCall> toolCalls,
            Map<String, AgentTool> visibleToolMap,
            String commandId,
            Map<String, ToolExecRecord> toolResultCache,
            java.util.function.Consumer<ToolExecRecord> onSingleToolDone) {

        if (toolCalls.size() == 1) {
            AiToolCall tc = toolCalls.get(0);
            String cacheKey = tc.getFunction().getName() + ":" + tc.getFunction().getArguments();
            ToolExecRecord cached = toolResultCache.get(cacheKey);
            if (cached != null) {
                log.info("[AiAgent-Cache] 工具缓存命中: {}", tc.getFunction().getName());
                ToolExecRecord result = new ToolExecRecord(tc.getId(), cached.toolName, cached.args,
                        cached.rawResult, cached.evidence, 0);
                if (onSingleToolDone != null) onSingleToolDone.accept(result);
                return List.of(result);
            }
            ToolExecRecord rec = executeSingleTool(tc, visibleToolMap, commandId);
            toolResultCache.put(cacheKey, rec);
            if (onSingleToolDone != null) onSingleToolDone.accept(rec);
            return List.of(rec);
        }

        // 并发执行 + 流式回调（完成一个推送一个）
        java.util.List<CompletableFuture<ToolExecRecord>> futures = new java.util.ArrayList<>();
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
                        UserContext.wrapSupplier(() -> executeSingleTool(toolCall, visibleToolMap, commandId)),
                        toolExecutor));
            }
        }

        java.util.List<ToolExecRecord> records = new java.util.ArrayList<>();
        // 使用 CompletableFuture.anyOf 模式：完成一个处理一个，不等待最慢的
        java.util.Set<CompletableFuture<ToolExecRecord>> remaining = new java.util.HashSet<>(futures);
        while (!remaining.isEmpty()) {
            try {
                CompletableFuture.anyOf(remaining.toArray(new CompletableFuture[0])).join();
            } catch (Exception ignored) {}

            java.util.Iterator<CompletableFuture<ToolExecRecord>> it = remaining.iterator();
            while (it.hasNext()) {
                CompletableFuture<ToolExecRecord> f = it.next();
                if (f.isDone()) {
                    try {
                        ToolExecRecord rec = f.join();
                        records.add(rec);
                        String cacheKey = rec.toolName + ":" + rec.args;
                        toolResultCache.putIfAbsent(cacheKey, rec);
                        if (onSingleToolDone != null) {
                            try {
                                onSingleToolDone.accept(rec);
                            } catch (Exception ex) {
                                log.debug("[AiAgent] 流式回调异常: {}", ex.getMessage());
                            }
                        }
                    } catch (Exception e) {
                        log.error("[AiAgent] 并发工具执行异常: {}", e.getMessage());
                        records.add(new ToolExecRecord("err", "unknown", "",
                                "{\"error\":\"工具执行异常: " + e.getMessage() + "\"}",
                                "【工具证据】\n- 状态: 异常\n- 错误: " + e.getMessage(), 0));
                    }
                    it.remove();
                }
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

        // ── CostExplosionGuard 接入点1：工具调用前熔断检查 + 重复检测 ──
        Long tenantId = UserContext.tenantId();
        String paramsHash = null;
        if (costExplosionGuard != null && tenantId != null) {
            try {
                // 1. 熔断检查：5分钟内同工具失败≥5次 → 熔断10分钟
                if (costExplosionGuard.isCircuitBroken(tenantId, toolName)) {
                    log.warn("[CostGuard] 熔断已触发，拒绝工具调用 tenantId={} tool={}", tenantId, toolName);
                    rawResult = "{\"error\":\"cost_circuit_broken\",\"message\":\"当前会话成本超限，请稍后重试或开启新会话\"}";
                    long elapsed = System.currentTimeMillis() - start;
                    return new ToolExecRecord(toolCallId, toolName, arguments, rawResult,
                            evidenceHelper.buildToolEvidenceMessage(toolName, rawResult), elapsed);
                }
                // 2. 重复检测：同工具同参数近期已调用 → 返回缓存结果
                paramsHash = costExplosionGuard.hashParams(arguments);
                java.util.Optional<String> cached = costExplosionGuard.checkDuplicateToolCall(tenantId, toolName, paramsHash);
                if (cached.isPresent()) {
                    log.info("[CostGuard] 重复工具调用命中缓存，跳过执行 tenantId={} tool={}", tenantId, toolName);
                    String cachedResult = cached.get();
                    long elapsed = System.currentTimeMillis() - start;
                    return new ToolExecRecord(toolCallId, toolName, arguments, cachedResult,
                            evidenceHelper.buildToolEvidenceMessage(toolName, cachedResult), elapsed);
                }
            } catch (Exception e) {
                log.debug("[CostGuard] 熔断/重复检测异常（降级放行）: {}", e.getMessage());
            }
        }

        if (toolHooks != null) {
            for (ToolExecutionHook hook : toolHooks) {
                try {
                    if (!hook.preToolUse(toolName, arguments)) {
                        log.info("[AiAgent] Hook 拦截工具调用: {}", toolName);
                        ConfirmLevel level = AiAgentToolAccessService.getConfirmLevel(toolName);
                        String label = AiAgentToolAccessService.getConfirmLabel(toolName);
                        rawResult = buildConfirmMessage(level, label);
                        long elapsed = System.currentTimeMillis() - start;
                        return new ToolExecRecord(toolCallId, toolName, arguments, rawResult,
                                evidenceHelper.buildToolEvidenceMessage(toolName, rawResult), elapsed);
                    }
                } catch (Exception e) {
                    log.warn("[AiAgent] preToolUse hook 异常: {}", e.getMessage());
                }
            }
        }

        // ── 写工具幂等保护：60s 内同租户同工具同参数复用首次结果 ──
        // 防止 LLM 重试 / 网络抖动 / 用户连击造成订单被改两次、工资被审两次等真实事故
        java.util.Optional<String> replayed = idempotencyService.tryReplay(toolName, arguments);
        if (replayed.isPresent()) {
            String replayResult = replayed.get();
            long elapsed = System.currentTimeMillis() - start;
            return new ToolExecRecord(toolCallId, toolName, arguments, replayResult,
                    evidenceHelper.buildToolEvidenceMessage(toolName, replayResult), elapsed);
        }

        AgentTool tool = visibleToolMap.get(toolName);

        // ── P0优化：只读工具跨会话缓存（ToolResultCacheService） ──
        // 在执行前先查缓存，命中则跳过执行
        if (tool != null && toolResultCacheService != null) {
            try {
                String cachedResult = toolResultCacheService.lookup(tool, toolName, arguments);
                if (cachedResult != null) {
                    log.info("[ToolCache] 跨会话缓存命中，跳过执行: tool={}", toolName);
                    long elapsed = System.currentTimeMillis() - start;
                    return new ToolExecRecord(toolCallId, toolName, arguments, cachedResult,
                            evidenceHelper.buildToolEvidenceMessage(toolName, cachedResult), elapsed);
                }
            } catch (Exception e) {
                log.debug("[ToolCache] 缓存查询异常，降级执行: {}", e.getMessage());
            }
        }

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

        // ── 写工具幂等收尾：成功回写结果，失败立即清键允许重试 ──
        if (success) {
            idempotencyService.saveResult(toolName, arguments, rawResult);

            // ── P0优化：只读工具执行成功后保存跨会话缓存 ──
            if (tool != null && toolResultCacheService != null) {
                try {
                    toolResultCacheService.save(tool, toolName, arguments, rawResult);
                } catch (Exception e) {
                    log.debug("[ToolCache] 缓存保存异常（不影响主流程）: {}", e.getMessage());
                }
            }
        } else {
            idempotencyService.clearOnFailure(toolName, arguments);
        }

        // ── CostExplosionGuard 接入点1：工具调用后记录成本（成功记录缓存/失败记录熔断） ──
        if (costExplosionGuard != null && tenantId != null) {
            try {
                if (success) {
                    // 记录工具调用结果（用于后续重复检测）
                    costExplosionGuard.recordToolCall(tenantId, toolName, paramsHash, rawResult);
                } else {
                    // 记录工具失败（用于熔断判断）
                    costExplosionGuard.recordToolFailure(tenantId, toolName);
                }
            } catch (Exception e) {
                log.debug("[CostGuard] 记录工具调用失败（不影响主流程）: {}", e.getMessage());
            }
        }

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

    /**
     * 截取一行文本（用于日志/显示）
     */
    public static String truncateOneLine(String text, int maxLength) {
        if (text == null) return "";
        String oneLine = text.replaceAll("\\s+", " ");
        if (oneLine.length() <= maxLength) return oneLine;
        return oneLine.substring(0, maxLength - 3) + "...";
    }

    private String buildConfirmMessage(ConfirmLevel level, String label) {
        if (level == ConfirmLevel.HIGH_RISK) {
            // 结构化 suggest payload（借鉴 CL4R1T4S opt-in 哲学：AI 建议、用户选择执行）
            return "{\"success\":false,\"needsConfirmation\":true,\"confirmLevel\":\"high_risk\","
                    + "\"suggest\":true,"
                    + "\"operationLabel\":\"" + label + "\","
                    + "\"summary\":\"" + label + "（高风险操作）\","
                    + "\"impact\":\"此操作可能影响订单/库存/工资等核心业务数据，执行后可能不可逆\","
                    + "\"message\":\"⚠️ " + label + "为高风险操作，需要您确认。请按以下格式向用户建议：\\n"
                    + "1. 用1-2句话说明即将执行什么操作（基于工具参数）\\n"
                    + "2. 说明影响范围（如'将修改订单X的状态'）\\n"
                    + "3. 问用户是否确认执行\\n"
                    + "用户确认后用相同参数再次调用即可。禁止长篇大论，禁止重复解释风险，禁止伪造执行结果。\"}";
        } else {
            return "{\"success\":false,\"needsConfirmation\":true,\"confirmLevel\":\"write\","
                    + "\"suggest\":true,"
                    + "\"operationLabel\":\"" + label + "\","
                    + "\"message\":\"" + label + "需要确认。请简洁展示操作摘要（1-2句话），用户确认后用相同参数再次调用即可。\"}";
        }
    }
}
