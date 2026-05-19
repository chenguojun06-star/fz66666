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
import com.fashion.supplychain.intelligence.entity.SkillTemplate;
import com.fashion.supplychain.intelligence.helper.AiAgentMemoryHelper;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import com.fashion.supplychain.intelligence.helper.XiaoyunPatterns;
import com.fashion.supplychain.intelligence.service.SelfCriticService;
import com.fashion.supplychain.intelligence.dto.AgentExecutionMetrics;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Collections;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@Service
public class AiAgentOrchestrator {

    @Autowired private AgentLoopContextBuilder contextBuilder;
    @Autowired private AgentLoopEngine loopEngine;
    @Autowired private AiAgentMemoryHelper memoryHelper;
    @Autowired private DecisionCardOrchestrator decisionCardOrchestrator;
    @Autowired private LongTermMemoryOrchestrator longTermMemoryOrchestrator;
    @Autowired(required = false) private ConversationReflectionOrchestrator reflectionOrchestrator;
    @Autowired(required = false) private com.fashion.supplychain.intelligence.service.SessionSearchService sessionSearchService;
    @Autowired(required = false) private SkillEvolutionOrchestrator skillEvolutionOrchestrator;
    @Autowired(required = false) private MemoryNudgeOrchestrator memoryNudgeOrchestrator;
    @Autowired(required = false) private UserProfileEvolutionOrchestrator userProfileEvolutionOrchestrator;
    @Autowired(required = false) private com.fashion.supplychain.intelligence.service.AgentContextFileService agentContextFileService;
    @Autowired private com.fashion.supplychain.intelligence.gateway.AiInferenceGateway inferenceGateway;
    @Autowired(required = false) private com.fashion.supplychain.intelligence.service.KnowledgeBaseService knowledgeBaseService;
    @Autowired private com.fashion.supplychain.intelligence.helper.PromptContextProvider promptContextProvider;
    @Autowired(required = false) private com.fashion.supplychain.intelligence.helper.PromptTemplateLoader promptTemplateLoader;
    @Autowired(required = false) private com.fashion.supplychain.intelligence.helper.AiAgentPromptHelper aiAgentPromptHelper;

    // 自我进化系统组件
    @Autowired(required = false) private SelfCriticService selfCriticService;
    @Autowired(required = false) private RealTimeLearningLoop realTimeLearningLoop;
    @Autowired(required = false) private QuickPathQualityGate quickPathQualityGate;
    @Autowired(required = false) private DynamicFollowUpEngine dynamicFollowUpEngine;

    // 五大Agent框架增强组件
    @Autowired(required = false) private com.fashion.supplychain.intelligence.service.MemoryBankService memoryBankService;
    @Autowired(required = false) private com.fashion.supplychain.intelligence.service.SkillAutoCreationService skillAutoCreationService;

    private final ThreadLocal<String> lastCommandIdHolder = new ThreadLocal<>();
    private final ThreadLocal<List<AiAgentToolExecHelper.ToolExecRecord>> lastToolRecordsHolder = new ThreadLocal<>();

    @Value("${xiaoyun.agent.timeout-ms:180000}")
    private long agentTimeoutMs;
    @Value("${xiaoyun.agent.context-refresh-ms:600000}")
    private long contextRefreshMs;
    @Value("${xiaoyun.agent.quick-path-timeout-ms:15000}")
    private long quickPathTimeoutMs;
    @Value("${xiaoyun.agent.sse-heartbeat-interval-s:15}")
    private int sseHeartbeatIntervalS;
    private static final ObjectMapper SSE_MAPPER = new ObjectMapper();

    private final ExecutorService postTurnExecutor = new ThreadPoolExecutor(
            2, 4, 60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(64),
            r -> { Thread t = new Thread(r, "post-turn-hook"); t.setDaemon(true); return t; },
            new ThreadPoolExecutor.CallerRunsPolicy());

    private final com.github.benmanes.caffeine.cache.Cache<String, String> queryCache = com.github.benmanes.caffeine.cache.Caffeine.newBuilder()
            .maximumSize(200)
            .expireAfterWrite(5, TimeUnit.MINUTES)
            .build();

    private static class TenantCachedContext {
        final String content;
        final long timestamp;
        TenantCachedContext(String content, long timestamp) {
            this.content = content;
            this.timestamp = timestamp;
        }
    }
    private final ConcurrentHashMap<Long, TenantCachedContext> systemContextCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Long, TenantCachedContext> skillContextCache = new ConcurrentHashMap<>();

    private String buildAugmentedPageContext(String userMessage, String originalPageContext) {
        StringBuilder augmented = new StringBuilder();
        if (originalPageContext != null && !originalPageContext.isBlank()) {
            augmented.append(originalPageContext);
        }

        Long tenantId = UserContext.tenantId();
        String systemContext = getOrRefreshSystemContext(tenantId);
        if (!systemContext.isBlank()) {
            if (augmented.length() > 0) augmented.append("\n---\n");
            augmented.append(systemContext);
        }

        String skillContext = getOrRefreshSkillContext(tenantId);
        if (!skillContext.isBlank()) {
            if (augmented.length() > 0) augmented.append("\n---\n");
            augmented.append(skillContext);
        }

        return augmented.toString();
    }

    private String getOrRefreshSystemContext(Long tenantId) {
        if (agentContextFileService == null || tenantId == null) return "";
        TenantCachedContext cached = systemContextCache.get(tenantId);
        long now = System.currentTimeMillis();
        if (cached != null && (now - cached.timestamp) <= contextRefreshMs) {
            return cached.content;
        }
        String content = agentContextFileService.buildSystemContext(tenantId);
        systemContextCache.put(tenantId, new TenantCachedContext(content, now));
        return content;
    }

    private String getOrRefreshSkillContext(Long tenantId) {
        if (skillEvolutionOrchestrator == null || tenantId == null) return "";
        TenantCachedContext cached = skillContextCache.get(tenantId);
        long now = System.currentTimeMillis();
        if (cached != null && (now - cached.timestamp) <= contextRefreshMs) {
            return cached.content;
        }
        List<SkillTemplate> skills = skillEvolutionOrchestrator.loadActiveSkills(tenantId);
        String content = "";
        if (skills != null && !skills.isEmpty()) {
            StringBuilder sb = new StringBuilder("## 可用技能 (系统自动学习)\n");
            for (SkillTemplate s : skills) {
                sb.append("- /").append(s.getSkillName())
                        .append(": ").append(s.getTitle());
                if (s.getTriggerPhrases() != null && !s.getTriggerPhrases().isBlank()) {
                    sb.append(" (触发词: ").append(s.getTriggerPhrases()).append(")");
                }
                sb.append("\n");
            }
            content = sb.toString();
        }
        skillContextCache.put(tenantId, new TenantCachedContext(content, now));
        return content;
    }

    public Result<String> executeAgent(String userMessage) {
        return executeAgent(userMessage, null);
    }

    public Result<String> executeAgent(String userMessage, String pageContext) {
        if (!contextBuilder.isModelEnabled()) {
            return Result.fail("智能服务暂未配置或不可用");
        }

        String augmentedPageContext = buildAugmentedPageContext(userMessage, pageContext);
        AgentLoopContext ctx = contextBuilder.build(userMessage, augmentedPageContext);
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

            triggerPostTurnHooks(ctx, userMessage, content, cb.getExecRecords(), false);

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
        ScheduledFuture<?> heartbeatFuture = null;
        AtomicBoolean cancelled = new AtomicBoolean(false);
        try {
            if (!contextBuilder.isModelEnabled()) {
                emitSse(emitter, "error", java.util.Map.of("message", "智能服务暂未配置或不可用"));
                emitSse(emitter, "done", java.util.Map.of());
                emitter.complete();
                return;
            }

            String cacheKey = UserContext.tenantId() + ":" + UserContext.userId() + ":" + userMessage;
            String cached = queryCache.getIfPresent(cacheKey);
            if (cached != null) {
                log.info("[AiAgent-Stream] 命中查询缓存，直接返回 ({}字符)", cached.length());
                AgentLoopContext ctx = contextBuilder.build(userMessage, pageContext);
                emitSse(emitter, "answer", java.util.Map.of("content", cached, "commandId", ctx.getCommandId()));
                emitSse(emitter, "done", java.util.Map.of());
                emitter.complete();
                return;
            }

            if (isQuickPathEligible(userMessage)) {
                boolean quickOk = tryQuickPath(userMessage, pageContext, emitter, cacheKey, requestStartAt);
                if (quickOk) {
                    return;
                }
                log.info("[AiAgent-Stream] 快速通道未产出有效回答，降级到Agent循环");
            }

            heartbeatFuture = startHeartbeat(emitter, sseHeartbeatIntervalS, cancelled);

            String augmentedPageContext = buildAugmentedPageContext(userMessage, pageContext);
            AgentLoopContext ctx = contextBuilder.build(userMessage, augmentedPageContext);
            ctx.setDeadlineMs(requestStartAt + agentTimeoutMs);
            ctx.setCancelled(cancelled);
            StreamingAgentLoopCallback cb = new StreamingAgentLoopCallback(
                    emitter, ctx, memoryHelper, decisionCardOrchestrator, longTermMemoryOrchestrator);

            String loopResult = loopEngine.run(ctx, cb);

            if ("plan_mode".equals(loopResult) || "stuck_detected".equals(loopResult)
                    || "token_budget_exceeded".equals(loopResult) || "max_iterations_exceeded".equals(loopResult)
                    || "cancelled".equals(loopResult) || "deadline_exceeded".equals(loopResult)) {
            } else if (cb.getFinalContent() != null && cb.getExecRecords().size() <= 2) {
                queryCache.put(cacheKey, deduplicateAnswer(cb.getFinalContent()));
            }

            triggerPostTurnHooks(ctx, userMessage, cb.getFinalContent(), cb.getExecRecords(), false);

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
            if (heartbeatFuture != null) {
                heartbeatFuture.cancel(false);
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

    private void triggerPostTurnHooks(AgentLoopContext ctx, String userMessage,
                                       String assistantResponse,
                                       java.util.List<AiAgentToolExecHelper.ToolExecRecord> toolRecords,
                                       boolean usedQuickPath) {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        String sessionId = "default";
        String conversationId = ctx != null ? ctx.getCommandId() : java.util.UUID.randomUUID().toString();

        String toolResultsStr = "";
        java.util.List<String> toolResultsList = new java.util.ArrayList<>();
        if (toolRecords != null && !toolRecords.isEmpty()) {
            StringBuilder sb = new StringBuilder();
            for (AiAgentToolExecHelper.ToolExecRecord rec : toolRecords) {
                String preview = rec.rawResult != null && rec.rawResult.length() > 200
                        ? rec.rawResult.substring(0, 200) + "..."
                        : rec.rawResult;
                sb.append(rec.toolName).append(": ").append(preview).append("\n");
                toolResultsList.add(rec.rawResult != null ? rec.rawResult : "");
            }
            toolResultsStr = sb.toString();
        }

        // === 自我批评与实时学习（新增）===
        if (selfCriticService != null) {
            try {
                AgentExecutionMetrics metrics = AgentExecutionMetrics.empty();
                metrics.setToolCallCount(toolRecords != null ? toolRecords.size() : 0);

                selfCriticService.critique(
                        conversationId, userMessage, assistantResponse,
                        null, toolResultsList, metrics, usedQuickPath);
            } catch (Exception e) {
                log.debug("[AiAgent] SelfCritic触发失败（非关键）: {}", e.getMessage());
            }
        }

        if (realTimeLearningLoop != null) {
            try {
                realTimeLearningLoop.trigger(
                        conversationId, userMessage, assistantResponse,
                        80.0, tenantId);
            } catch (Exception e) {
                log.debug("[AiAgent] RealTimeLearning触发失败（非关键）: {}", e.getMessage());
            }
        }

        if (memoryBankService != null) {
            try {
                memoryBankService.onFocusChange(tenantId,
                        userMessage.length() > 100 ? userMessage.substring(0, 100) : userMessage);
            } catch (Exception e) {
                log.debug("[AiAgent] MemoryBank更新失败（非关键）: {}", e.getMessage());
            }
        }

        if (skillAutoCreationService != null && reflectionOrchestrator == null
                && toolRecords != null && toolRecords.size() >= 3) {
            try {
                skillAutoCreationService.tryAutoCreateFromTask(
                        tenantId, conversationId, userMessage,
                        toolResultsStr, assistantResponse, 0.75);
            } catch (Exception e) {
                log.debug("[AiAgent] SkillAutoCreation触发失败（非关键）: {}", e.getMessage());
            }
        }

        if (reflectionOrchestrator != null) {
            final String finalToolResults = toolResultsStr;
            final String finalConversationId = conversationId;
            postTurnExecutor.execute(UserContext.wrap(() -> {
                reflectionOrchestrator.reflectAsync(
                        tenantId, finalConversationId, sessionId,
                        userMessage, assistantResponse, finalToolResults);
            }));
        }

        if (sessionSearchService != null) {
            sessionSearchService.indexConversation(
                    tenantId, userId, sessionId, conversationId,
                    userMessage, assistantResponse);
        }

        List<String> toolNames = new java.util.ArrayList<>();
        if (toolRecords != null) {
            for (AiAgentToolExecHelper.ToolExecRecord rec : toolRecords) {
                toolNames.add(rec.toolName);
            }
        }

        if (memoryNudgeOrchestrator != null) {
            final List<String> finalToolNames = toolNames;
            postTurnExecutor.execute(UserContext.wrap(() -> {
                memoryNudgeOrchestrator.analyzeAndNudge(
                        tenantId, userId, sessionId, conversationId,
                        userMessage, assistantResponse, finalToolNames);
            }));
        }

        if (userProfileEvolutionOrchestrator != null) {
            final List<String> finalToolNames2 = toolNames;
            postTurnExecutor.execute(UserContext.wrap(() -> {
                userProfileEvolutionOrchestrator.evolveProfile(
                        tenantId, userId, userMessage, assistantResponse,
                        conversationId, finalToolNames2);
            }));
        }
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
            emitter.send(SseEmitter.event().name(eventName).data(SSE_MAPPER.writeValueAsString(data)));
        } catch (Exception e) {
            log.warn("[AiAgent-Stream] 发送SSE事件失败: event={}, error={}", eventName, e.getMessage());
        }
    }

    private static final ScheduledExecutorService SHARED_HEARTBEAT_SCHEDULER =
            Executors.newScheduledThreadPool(2, r -> {
                Thread t = new Thread(r, "sse-hb-shared");
                t.setDaemon(true);
                return t;
            });

    private ScheduledFuture<?> startHeartbeat(SseEmitter emitter, int intervalSeconds, AtomicBoolean cancelled) {
        java.util.concurrent.atomic.AtomicReference<ScheduledFuture<?>> futureRef = new java.util.concurrent.atomic.AtomicReference<>();
        ScheduledFuture<?> future = SHARED_HEARTBEAT_SCHEDULER.scheduleAtFixedRate(() -> {
            try {
                emitter.send(SseEmitter.event().comment("heartbeat " + System.currentTimeMillis()));
            } catch (Exception e) {
                log.debug("[AiAgent-Stream] 心跳发送失败，连接已断开，中断Agent执行");
                cancelled.set(true);
                ScheduledFuture<?> f = futureRef.get();
                if (f != null) f.cancel(false);
            }
        }, intervalSeconds, intervalSeconds, TimeUnit.SECONDS);
        futureRef.set(future);
        return future;
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


    private boolean isQuickPathEligible(String userMessage) {
        if (userMessage == null || userMessage.length() > 500) return false;
        XiaoyunPatterns.IntentType intent = XiaoyunPatterns.estimateIntent(userMessage);
        if (intent == XiaoyunPatterns.IntentType.ACTION_COMMAND) return false;
        if (intent == XiaoyunPatterns.IntentType.COMPLEX_ANALYSIS) return false;
        if (intent == XiaoyunPatterns.IntentType.SMALL_TALK) return true;
        if (intent == XiaoyunPatterns.IntentType.KNOWLEDGE_ASK) return true;
        return userMessage.length() <= 20;
    }

    private boolean tryQuickPath(String userMessage, String pageContext, SseEmitter emitter,
                                  String cacheKey, long requestStartAt) {
        try {
            String commandId = java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 16);

            String ragContext = "";
            if (knowledgeBaseService != null) {
                try {
                    ragContext = promptContextProvider.buildRagContext(UserContext.tenantId(), userMessage);
                } catch (Exception e) {
                    log.debug("[QuickPath] RAG检索跳过: {}", e.getMessage());
                }
            }

            String intelligenceCtx = "";
            try {
                intelligenceCtx = promptContextProvider.buildIntelligenceContext();
            } catch (Exception e) {
                log.debug("[QuickPath] 经营上下文跳过: {}", e.getMessage());
            }

            StringBuilder sysPrompt = new StringBuilder();
            String identity = promptTemplateLoader != null ? promptTemplateLoader.getBaseIdentity() : null;
            if (identity == null || identity.isBlank()) {
                identity = "你是小云——服装供应链首席运营顾问，由云裳智链Trivia团队开发。";
            }
            sysPrompt.append(identity).append("\n\n");
            String principles = promptTemplateLoader != null ? promptTemplateLoader.getBasePrinciples() : null;
            if (principles != null && !principles.isBlank()) {
                sysPrompt.append(principles).append("\n\n");
            }
            if (aiAgentPromptHelper != null) {
                try {
                    String userCtx = aiAgentPromptHelper.buildUserContextBlock();
                    if (userCtx != null && !userCtx.isBlank()) {
                        sysPrompt.append(userCtx).append("\n\n");
                    }
                } catch (Exception e) {
                    log.warn("[QuickPath] 用户身份上下文注入失败: {}", e.getMessage());
                }
            }
            sysPrompt.append("请简洁、准确地回答用户问题。如果下方有知识库参考资料，优先引用；如无相关内容，根据业务经验作答，不要编造。\n\n");
            if (intelligenceCtx != null && !intelligenceCtx.isBlank()) {
                sysPrompt.append(intelligenceCtx).append("\n\n");
            }
            if (ragContext != null && !ragContext.isBlank()) {
                sysPrompt.append(ragContext).append("\n\n");
            }
            if (pageContext != null && !pageContext.isBlank()) {
                sysPrompt.append("【当前页面上下文】\n").append(pageContext).append("\n\n");
            }
            if (memoryBankService != null) {
                try {
                    Long mbTenantId = UserContext.tenantId();
                    if (mbTenantId != null && memoryBankService.isInitialized(mbTenantId)) {
                        String mbCtx = memoryBankService.compileContextForPrompt(mbTenantId);
                        if (mbCtx != null && !mbCtx.isBlank() && !mbCtx.contains("尚未初始化")) {
                            sysPrompt.append(mbCtx).append("\n\n");
                        }
                    }
                } catch (Exception e) {
                    log.debug("[QuickPath] MemoryBank注入跳过: {}", e.getMessage());
                }
            }

            com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult result;
            java.util.List<com.fashion.supplychain.intelligence.agent.AiMessage> quickMsgs = java.util.List.of(
                    com.fashion.supplychain.intelligence.agent.AiMessage.system(sysPrompt.toString()),
                    com.fashion.supplychain.intelligence.agent.AiMessage.user(userMessage));
            StringBuilder answerBuf = new StringBuilder();
            result = inferenceGateway.chatStream("ai-advisor", quickMsgs, java.util.List.of(),
                    (chunk, done) -> { if (done) return; answerBuf.append(chunk);
                        try { emitSse(emitter, "answer_chunk", java.util.Map.of("chunk", chunk, "commandId", commandId)); }
                        catch (Exception e) { log.debug("[QuickPath] chunk发送跳过"); } });
            String answer = answerBuf.toString();

            if (!result.isSuccess() || answer.isBlank()) {
                log.info("[QuickPath] 快速通道未产出有效回答: {}", result.getErrorMessage());
                return false;
            }

            long elapsed = System.currentTimeMillis() - requestStartAt;
            log.info("[QuickPath] 快速通道完成(流式): {}字符, {}ms", answer.length(), elapsed);

            if (quickPathQualityGate != null) {
                QuickPathQualityGate.QualityGateResult gateResult = quickPathQualityGate.review(userMessage, answer);
                if (!gateResult.isPassed()) {
                    log.warn("[QuickPath] 质量门未通过: {}，降级到Agent循环", gateResult.getReason());
                    return false;
                }
            }

            emitSse(emitter, "done", java.util.Map.of());
            emitter.complete();

            queryCache.put(cacheKey, deduplicateAnswer(answer));

            // 触发后处理（标记为快速通道）
            triggerPostTurnHooks(null, userMessage, answer, java.util.Collections.emptyList(), true);

            return true;
        } catch (Exception e) {
            log.warn("[QuickPath] 快速通道异常，降级到Agent循环: {}", e.getMessage());
            return false;
        }
    }
}
