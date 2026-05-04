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
import com.fashion.supplychain.intelligence.service.SelfCriticService;
import com.fashion.supplychain.intelligence.dto.AgentExecutionMetrics;
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

    // 自我进化系统组件
    @Autowired(required = false) private SelfCriticService selfCriticService;
    @Autowired(required = false) private RealTimeLearningLoop realTimeLearningLoop;
    @Autowired(required = false) private QuickPathQualityGate quickPathQualityGate;
    @Autowired(required = false) private DynamicFollowUpEngine dynamicFollowUpEngine;

    private final ThreadLocal<String> lastCommandIdHolder = new ThreadLocal<>();
    private final ThreadLocal<List<AiAgentToolExecHelper.ToolExecRecord>> lastToolRecordsHolder = new ThreadLocal<>();

    private static final long AGENT_TIMEOUT_MS = TimeUnit.SECONDS.toMillis(180);
    private static final long CONTEXT_REFRESH_MS = TimeUnit.MINUTES.toMillis(10);
    private final com.github.benmanes.caffeine.cache.Cache<String, String> queryCache = com.github.benmanes.caffeine.cache.Caffeine.newBuilder()
            .maximumSize(200)
            .expireAfterWrite(5, TimeUnit.MINUTES)
            .build();

    private volatile String cachedSystemContext = "";
    private volatile long lastContextRefresh = 0;
    private volatile String cachedSkillContext = "";
    private volatile long lastSkillRefresh = 0;

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
        long now = System.currentTimeMillis();
        if (agentContextFileService == null) return "";
        if (now - lastContextRefresh > CONTEXT_REFRESH_MS) {
            synchronized (this) {
                if (now - lastContextRefresh > CONTEXT_REFRESH_MS) {
                    cachedSystemContext = agentContextFileService.buildSystemContext(tenantId);
                    lastContextRefresh = now;
                }
            }
        }
        return cachedSystemContext;
    }

    private String getOrRefreshSkillContext(Long tenantId) {
        long now = System.currentTimeMillis();
        if (skillEvolutionOrchestrator == null) return "";
        if (now - lastSkillRefresh > CONTEXT_REFRESH_MS) {
            synchronized (this) {
                if (now - lastSkillRefresh > CONTEXT_REFRESH_MS) {
                    List<SkillTemplate> skills = skillEvolutionOrchestrator.loadActiveSkills(tenantId);
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
                        cachedSkillContext = sb.toString();
                    } else {
                        cachedSkillContext = "";
                    }
                    lastSkillRefresh = now;
                }
            }
        }
        return cachedSkillContext;
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
        ScheduledExecutorService heartbeat = null;
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

            heartbeat = startHeartbeat(emitter, 15, cancelled);

            String augmentedPageContext = buildAugmentedPageContext(userMessage, pageContext);
            AgentLoopContext ctx = contextBuilder.build(userMessage, augmentedPageContext);
            ctx.setDeadlineMs(requestStartAt + AGENT_TIMEOUT_MS);
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
                        80.0, tenantId); // 默认80分，SelfCritic会独立计算
            } catch (Exception e) {
                log.debug("[AiAgent] RealTimeLearning触发失败（非关键）: {}", e.getMessage());
            }
        }

        if (reflectionOrchestrator != null) {
            final String finalToolResults = toolResultsStr;
            final String finalConversationId = conversationId;
            new Thread(UserContext.wrap(() -> {
                reflectionOrchestrator.reflectAsync(
                        tenantId, finalConversationId, sessionId,
                        userMessage, assistantResponse, finalToolResults);
            }), "post-turn-reflection").start();
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
            new Thread(UserContext.wrap(() -> {
                memoryNudgeOrchestrator.analyzeAndNudge(
                        tenantId, userId, sessionId, conversationId,
                        userMessage, assistantResponse, finalToolNames);
            }), "post-turn-nudge").start();
        }

        if (userProfileEvolutionOrchestrator != null) {
            final List<String> finalToolNames2 = toolNames;
            new Thread(UserContext.wrap(() -> {
                userProfileEvolutionOrchestrator.evolveProfile(
                        tenantId, userId, userMessage, assistantResponse,
                        conversationId, finalToolNames2);
            }), "post-turn-profile").start();
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
            ObjectMapper mapper = new ObjectMapper();
            emitter.send(SseEmitter.event().name(eventName).data(mapper.writeValueAsString(data)));
        } catch (Exception e) {
            log.warn("[AiAgent-Stream] 发送SSE事件失败: event={}, error={}", eventName, e.getMessage());
        }
    }

    private ScheduledExecutorService startHeartbeat(SseEmitter emitter, int intervalSeconds, AtomicBoolean cancelled) {
        ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "sse-hb-" + emitter.hashCode());
            t.setDaemon(true);
            return t;
        });
        scheduler.scheduleAtFixedRate(() -> {
            try {
                emitter.send(SseEmitter.event().comment("heartbeat " + System.currentTimeMillis()));
            } catch (Exception e) {
                log.debug("[AiAgent-Stream] 心跳发送失败，连接已断开，中断Agent执行");
                cancelled.set(true);
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

    private static final java.util.regex.Pattern QUICK_GREETING =
            java.util.regex.Pattern.compile("(?s).*(你好|hi|hello|谢谢|再见|你是谁|在吗|辛苦了|好的|收到|明白|知道了|了解).*");
    private static final java.util.regex.Pattern COMPLEX_TRIGGER =
            java.util.regex.Pattern.compile("(?s).*(入库|建单|创建订单|审批|结算|撤回扫码|分配|派单|新建|快速建单|帮我.*做|去做|执行.*操作|对比|排名|趋势|分析|汇总|所有|每个|各个|评估|预测|方案|为什么|怎么办|如何优化|哪些.*风险|哪些.*问题|什么问题|什么情况|什么原因|看一下|查一下|帮我查|告诉我).*");
    private static final java.util.regex.Pattern BUSINESS_KEYWORD =
            java.util.regex.Pattern.compile("(?s).*(订单|进度|逾期|异常|风险|工厂|工资|库存|物料|裁剪|扫码|入库|出货|对账|结算|款式|样衣|采购|催单|备注|紧急|延期|交期|产能|成本|利润|质量|次品|领料|盘点|发票|税务|报价|BOM|模板|工序|菲号|转厂|撤回|审批|通知|跟单|客户|供应商|成品|面辅|面料|辅料|报价单|生产|完成率|准时率|逾期率|在制|待处理|待审批|待质检|待入库).*");

    private boolean isQuickPathEligible(String userMessage) {
        if (userMessage == null || userMessage.length() > 200) return false;
        if (COMPLEX_TRIGGER.matcher(userMessage).matches()) return false;
        if (BUSINESS_KEYWORD.matcher(userMessage).matches()) return false;
        if (QUICK_GREETING.matcher(userMessage).matches()) return true;
        if (userMessage.length() <= 15) return true;
        return false;
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
            sysPrompt.append("你是「小云」，服装供应链智能助手。请简洁、准确地回答用户问题。\n");
            sysPrompt.append("如果下方有知识库参考资料，优先引用；如无相关内容，根据业务经验作答，不要编造。\n\n");
            if (intelligenceCtx != null && !intelligenceCtx.isBlank()) {
                sysPrompt.append(intelligenceCtx).append("\n\n");
            }
            if (ragContext != null && !ragContext.isBlank()) {
                sysPrompt.append(ragContext).append("\n\n");
            }
            if (pageContext != null && !pageContext.isBlank()) {
                sysPrompt.append("【当前页面上下文】\n").append(pageContext).append("\n\n");
            }

            com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult result =
                    inferenceGateway.chat("ai-advisor", sysPrompt.toString(), userMessage);

            if (!result.isSuccess() || result.getContent() == null || result.getContent().isBlank()) {
                log.info("[QuickPath] 单次调用未产出有效回答: {}", result.getErrorMessage());
                return false;
            }

            String answer = result.getContent();

            // === 快速通道质量门审查（新增）===
            if (quickPathQualityGate != null) {
                QuickPathQualityGate.QualityGateResult gateResult = quickPathQualityGate.review(userMessage, answer);
                if (!gateResult.isPassed()) {
                    log.warn("[QuickPath] 质量门未通过: {}，降级到Agent循环", gateResult.getReason());
                    return false;
                }
            }

            long elapsed = System.currentTimeMillis() - requestStartAt;
            log.info("[QuickPath] 快速通道完成: {}字符, {}ms", answer.length(), elapsed);

            emitSse(emitter, "answer", java.util.Map.of("content", answer, "commandId", commandId));
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
