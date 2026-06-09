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
import com.fashion.supplychain.intelligence.entity.AiLongMemory;
import com.fashion.supplychain.intelligence.mapper.AiLongMemoryMapper;
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
    @Autowired private org.springframework.beans.factory.ObjectProvider<ConversationReflectionOrchestrator> reflectionOrchestratorProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.service.SessionSearchService> sessionSearchServiceProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<SkillEvolutionOrchestrator> skillEvolutionOrchestratorProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<MemoryNudgeOrchestrator> memoryNudgeOrchestratorProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<UserProfileEvolutionOrchestrator> userProfileEvolutionOrchestratorProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.service.AgentContextFileService> agentContextFileServiceProvider;
    @Autowired private com.fashion.supplychain.intelligence.gateway.AiInferenceGateway inferenceGateway;
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.service.KnowledgeBaseService> knowledgeBaseServiceProvider;
    @Autowired private com.fashion.supplychain.intelligence.helper.PromptContextProvider promptContextProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.helper.PromptTemplateLoader> promptTemplateLoaderProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.helper.AiAgentPromptHelper> aiAgentPromptHelperProvider;

    // 自我进化系统组件
    @Autowired private org.springframework.beans.factory.ObjectProvider<SelfCriticService> selfCriticServiceProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<RealTimeLearningLoop> realTimeLearningLoopProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<QuickPathQualityGate> quickPathQualityGateProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<DynamicFollowUpEngine> dynamicFollowUpEngineProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.service.GoldenEvalService> goldenEvalServiceProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.service.GuardrailsConfigService> guardrailsConfigServiceProvider;
    /** P2升级: 结构化输出后处理 */
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.service.StructuredOutputEnforcer> outputEnforcerProvider;

    // 五大Agent框架增强组件
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.service.MemoryBankService> memoryBankServiceProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.service.SkillAutoCreationService> skillAutoCreationServiceProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.service.EntityMemoryContextService> entityMemoryContextServiceProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<AiLongMemoryMapper> longMemoryMapperProvider;

    // Phase 3/4 高级推理引擎
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.upgrade.phase3.TreeOfThoughtsEngine> treeOfThoughtsEngineProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.upgrade.phase4.GraphOfThoughtsEngine> graphOfThoughtsEngineProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.upgrade.phase3.IntentDrivenDagService> intentDrivenDagServiceProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.upgrade.phase4.DagVisualizationService> dagVisualizationServiceProvider;

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

    private final java.util.concurrent.atomic.AtomicLong conversationTurnCounter = new java.util.concurrent.atomic.AtomicLong(0);

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
        com.fashion.supplychain.intelligence.service.AgentContextFileService agentContextFileService = agentContextFileServiceProvider.getIfAvailable();
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
        SkillEvolutionOrchestrator skillEvolutionOrchestrator = skillEvolutionOrchestratorProvider.getIfAvailable();
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
        // 先尝试关键词匹配
        String keywordAnswer = matchKeywordIntent(userMessage);
        if (keywordAnswer != null) {
            return Result.success(keywordAnswer);
        }

        // 如果没有关键词匹配，再检查模型是否启用
        if (!contextBuilder.isModelEnabled()) {
            // 模型未启用时提供友好的默认回答
            String defaultAnswer = getDefaultAnswer(userMessage);
            return Result.success(defaultAnswer);
        }

        String augmentedPageContext = buildAugmentedPageContext(userMessage, pageContext);

        // P1升级: 复杂问题先用ToT/GoT生成推理摘要，注入到AgentLoop上下文中（不直接返回，确保工具正常执行）
        String reasoningHint = tryAdvancedReasoning(userMessage, pageContext);
        if (reasoningHint != null && !reasoningHint.isBlank()) {
            augmentedPageContext = "[高级推理参考]\n" + reasoningHint + "\n\n" + augmentedPageContext;
            log.info("[AiAgent] 高级推理引擎产出推理提示，注入AgentLoop上下文");
        }

        // P1升级: 尝试意图驱动DAG规划，结果注入上下文（不直接返回）
        String dagHint = tryIntentDrivenDag(userMessage, pageContext);
        if (dagHint != null && !dagHint.isBlank()) {
            augmentedPageContext = dagHint + "\n\n" + augmentedPageContext;
            log.info("[AiAgent] 意图驱动DAG产出规划提示，注入AgentLoop上下文");
        }

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
                // 如果模型返回null，尝试返回默认回答
                return Result.success(getDefaultAnswer(userMessage));
            }

            triggerPostTurnHooks(ctx, userMessage, content, cb.getExecRecords(), false);

            return Result.success(content);
        } finally {
            lastCommandIdHolder.remove();
            lastToolRecordsHolder.remove();
            AgentModeContext.clear();
        }
    }

    private String matchKeywordIntent(String userMessage) {
        if (userMessage == null || userMessage.isBlank()) return null;
        String msg = userMessage.toLowerCase();
        if (msg.contains("订单") && (msg.contains("进度") || msg.contains("状态")))
            return "您可以在订单管理页面查看订单进度，或告诉我具体的订单号，我帮您查询。";
        if (msg.contains("延期") || msg.contains("逾期"))
            return "延期订单信息已同步到待办中心，您可以查看详情或告诉我订单号我帮您分析。";
        if (msg.contains("扫码") || msg.contains("产量"))
            return "扫码记录会实时同步，您可以在生产进度页面查看当前产量统计。";
        if (msg.contains("工资") || msg.contains("结算"))
            return "工资结算信息在工资管理页面，您可以查看明细或选择特定时间段查询。";
        if (msg.contains("库存") || msg.contains("入库"))
            return "库存信息在仓储管理页面，您可以查看实时库存和入库记录。";
        if (msg.contains("你好") || msg.contains("hi") || msg.contains("hello"))
            return "你好！我是小云，你的服装供应链智能助手。有什么可以帮到你的？";
        if (msg.contains("帮助") || msg.contains("怎么"))
            return "你可以问我关于订单进度、扫码统计、工资结算、库存查询等问题，我会尽力帮你解答！";
        return null;
    }

    private String getDefaultAnswer(String userMessage) {
        if (userMessage == null || userMessage.isBlank()) {
            return "你好！我是小云，你的服装供应链智能助手。有什么可以帮到你的？";
        }
        return "我正在学习中，暂时无法回答这个问题。你可以尝试问我关于订单进度、扫码统计、工资结算、库存查询等问题。";
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
            // 先尝试关键词匹配
            String keywordAnswer = matchKeywordIntent(userMessage);
            if (keywordAnswer != null) {
                // 关键词兜底不需要完整的 context，直接生成一个简单的 commandId
                String simpleCommandId = "cmd-" + System.currentTimeMillis();
                emitSse(emitter, "answer", java.util.Map.of("content", keywordAnswer, "commandId", simpleCommandId));
                emitSse(emitter, "done", java.util.Map.of());
                emitter.complete();
                return;
            }

            // 如果没有关键词匹配，再检查模型是否启用
            if (!contextBuilder.isModelEnabled()) {
                // 模型未启用时提供友好的默认回答
                String defaultAnswer = getDefaultAnswer(userMessage);
                String simpleCommandId = "cmd-" + System.currentTimeMillis();
                emitSse(emitter, "answer", java.util.Map.of("content", defaultAnswer, "commandId", simpleCommandId));
                emitSse(emitter, "done", java.util.Map.of());
                emitter.complete();
                return;
            }

            String pageContextKeyPart = pageContext != null ? String.valueOf(pageContext.hashCode()) : "no_ctx";
            String cacheKey = UserContext.tenantId() + ":" + UserContext.userId() + ":" + userMessage + ":" + pageContextKeyPart;
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

            // P1升级: 复杂问题先用ToT/GoT生成推理摘要，注入到AgentLoop上下文中
            String reasoningHint = tryAdvancedReasoning(userMessage, pageContext);
            if (reasoningHint != null && !reasoningHint.isBlank()) {
                augmentedPageContext = "[高级推理参考]\n" + reasoningHint + "\n\n" + augmentedPageContext;
                log.info("[AiAgent-Stream] 高级推理引擎产出推理提示，注入AgentLoop上下文");
            }

            // P1升级: 尝试意图驱动DAG规划，结果注入上下文
            String dagHint = tryIntentDrivenDag(userMessage, pageContext);
            if (dagHint != null && !dagHint.isBlank()) {
                augmentedPageContext = dagHint + "\n\n" + augmentedPageContext;
                log.info("[AiAgent-Stream] 意图驱动DAG产出规划提示，注入AgentLoop上下文");
            }

            AgentLoopContext ctx = contextBuilder.build(userMessage, augmentedPageContext);
            ctx.setDeadlineMs(requestStartAt + agentTimeoutMs);
            ctx.setCancelled(cancelled);
            StreamingAgentLoopCallback cb = new StreamingAgentLoopCallback(
                    emitter, ctx, memoryHelper, decisionCardOrchestrator, longTermMemoryOrchestrator);

            String loopResult = loopEngine.run(ctx, cb);

            if ("plan_mode".equals(loopResult) || "stuck_detected".equals(loopResult)
                    || "token_budget_exceeded".equals(loopResult) || "max_iterations_exceeded".equals(loopResult)
                    || "cancelled".equals(loopResult) || "deadline_exceeded".equals(loopResult)) {
                // 失败或取消不缓存
            } else if (cb.getFinalContent() != null) {
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

    private void learnEntityMemoryFromTools(Long tenantId, String toolResultsStr) {
        AiLongMemoryMapper longMemoryMapper = longMemoryMapperProvider.getIfAvailable();
        if (longMemoryMapper == null) return;
        String userId = UserContext.userId();
        try {
            java.util.Set<String> entities = extractEntityNames(toolResultsStr);
            if (entities.isEmpty()) return;

            for (String entity : entities) {
                try {
                    AiLongMemory existing = longMemoryMapper.selectOne(
                            new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AiLongMemory>()
                                    .eq(AiLongMemory::getTenantId, tenantId)
                                    .eq(AiLongMemory::getDeleteFlag, 0)
                                    .eq(AiLongMemory::getSubjectName, entity)
                                    .eq(AiLongMemory::getLayer, "FACT")
                                    .last("LIMIT 1"));
                    if (existing != null) {
                        existing.setHitCount((existing.getHitCount() != null ? existing.getHitCount() : 0) + 1);
                        existing.setUpdateTime(java.time.LocalDateTime.now());
                        longMemoryMapper.updateById(existing);
                    } else {
                        AiLongMemory newMem = new AiLongMemory();
                        newMem.setTenantId(tenantId);
                        newMem.setSourceUserId(UserContext.userId());
                        newMem.setSubjectName(entity);
                        newMem.setSubjectType(detectEntityType(entity));
                        newMem.setLayer("FACT");
                        newMem.setContent("从对话中自动发现实体: " + entity);
                        newMem.setConfidence(new java.math.BigDecimal("0.6"));
                        newMem.setHitCount(1);
                        newMem.setDeleteFlag(0);
                        newMem.setCreateTime(java.time.LocalDateTime.now());
                        newMem.setUpdateTime(java.time.LocalDateTime.now());
                        longMemoryMapper.insert(newMem);
                        log.debug("[EntityMemory] 新增实体记忆: {}", entity);
                    }
                } catch (Exception ex) {
                    log.debug("[EntityMemory] 实体记忆保存跳过: {} - {}", entity, ex.getMessage());
                }
            }
        } catch (Exception e) {
            log.debug("[EntityMemory] 实体记忆学习跳过: {}", e.getMessage());
        }
    }

    private java.util.Set<String> extractEntityNames(String toolResultsStr) {
        java.util.Set<String> entities = new java.util.LinkedHashSet<>();
        if (toolResultsStr == null || toolResultsStr.isBlank()) return entities;
        java.util.regex.Pattern orderPattern = java.util.regex.Pattern.compile("PO\\d{14}|[A-Z]{2,4}\\d{8,}");
        java.util.regex.Pattern stylePattern = java.util.regex.Pattern.compile("[A-Z]{2,4}-?\\d{4,}[A-Z]?");

        java.util.regex.Matcher m = orderPattern.matcher(toolResultsStr);
        while (m.find()) entities.add(m.group());
        m = stylePattern.matcher(toolResultsStr);
        while (m.find()) entities.add(m.group());
        return entities;
    }

    private String detectEntityType(String entityName) {
        if (entityName == null) return "unknown";
        if (entityName.startsWith("PO") || entityName.matches("[A-Z]{2,4}\\d{8,}")) return "order";
        if (entityName.matches("[A-Z]{2,4}-?\\d{4,}[A-Z]?")) return "style";
        return "unknown";
    }

    private void triggerPostTurnHooks(AgentLoopContext ctx, String userMessage,
                                   String assistantResponse,
                                   List<AiAgentToolExecHelper.ToolExecRecord> toolRecords,
                                   boolean usedQuickPath) {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        String sessionId = ctx != null && ctx.getStateSessionId() != null ? ctx.getStateSessionId() : (ctx != null ? ctx.getCommandId() : java.util.UUID.randomUUID().toString());
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

        double selfScore = 80.0;

        // === 自我批评与实时学习（新增）===
        SelfCriticService selfCriticService = selfCriticServiceProvider.getIfAvailable();
        if (selfCriticService != null) {
            try {
                AgentExecutionMetrics metrics = AgentExecutionMetrics.empty();
                metrics.setToolCallCount(toolRecords != null ? toolRecords.size() : 0);

                // 先同步计算评分
                selfScore = selfCriticService.calculateCritiqueScore(
                        sessionId, userMessage, assistantResponse,
                        null, toolResultsList, metrics, usedQuickPath);

                // 再异步触发完整自我批评（异步保存反馈/快照/路由）
                selfCriticService.critique(
                        sessionId, userMessage, assistantResponse,
                        null, toolResultsList, metrics, usedQuickPath);
            } catch (Exception e) {
                log.debug("[AiAgent] SelfCritic触发失败（非关键）: {}", e.getMessage());
            }
        }

        final double finalSelfScore = selfScore;

        RealTimeLearningLoop realTimeLearningLoop = realTimeLearningLoopProvider.getIfAvailable();
        if (realTimeLearningLoop != null) {
            try {
                realTimeLearningLoop.trigger(
                        conversationId, userMessage, assistantResponse,
                        selfScore, tenantId);
            } catch (Exception e) {
                log.debug("[AiAgent] RealTimeLearning触发失败（非关键）: {}", e.getMessage());
            }
        }

        com.fashion.supplychain.intelligence.service.MemoryBankService memoryBankService = memoryBankServiceProvider.getIfAvailable();
        if (memoryBankService != null) {
            try {
                memoryBankService.onFocusChange(tenantId,
                        userMessage.length() > 100 ? userMessage.substring(0, 100) : userMessage);
            } catch (Exception e) {
                log.debug("[AiAgent] MemoryBank更新失败（非关键）: {}", e.getMessage());
            }
        }

        com.fashion.supplychain.intelligence.service.SkillAutoCreationService skillAutoCreationService = skillAutoCreationServiceProvider.getIfAvailable();
        ConversationReflectionOrchestrator reflectionOrchestrator = reflectionOrchestratorProvider.getIfAvailable();
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

        com.fashion.supplychain.intelligence.service.SessionSearchService sessionSearchService = sessionSearchServiceProvider.getIfAvailable();
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

        // P1升级: 在线评估采样 — 10%流量触发LLM-as-Judge，与SelfCritic对比校准
        com.fashion.supplychain.intelligence.service.GoldenEvalService goldenEvalService = goldenEvalServiceProvider.getIfAvailable();
        if (goldenEvalService != null && assistantResponse != null && !assistantResponse.isBlank()) {
            postTurnExecutor.execute(UserContext.wrap(() -> {
                goldenEvalService.maybeOnlineEvaluate(userMessage, assistantResponse, finalSelfScore);
            }));
        }

        MemoryNudgeOrchestrator memoryNudgeOrchestrator = memoryNudgeOrchestratorProvider.getIfAvailable();
        if (memoryNudgeOrchestrator != null) {
            final List<String> finalToolNames = toolNames;
            postTurnExecutor.execute(UserContext.wrap(() -> {
                memoryNudgeOrchestrator.analyzeAndNudge(
                        tenantId, userId, sessionId, conversationId,
                        userMessage, assistantResponse, finalToolNames);
            }));
        }

        UserProfileEvolutionOrchestrator userProfileEvolutionOrchestrator = userProfileEvolutionOrchestratorProvider.getIfAvailable();
        if (userProfileEvolutionOrchestrator != null) {
            final List<String> finalToolNames2 = toolNames;
            postTurnExecutor.execute(UserContext.wrap(() -> {
                userProfileEvolutionOrchestrator.evolveProfile(
                        tenantId, userId, userMessage, assistantResponse,
                        conversationId, finalToolNames2);
            }));
        }

        long turnCount = conversationTurnCounter.incrementAndGet();
        if (!usedQuickPath && turnCount % 3 == 0) {
            postTurnExecutor.execute(UserContext.wrap(() -> {
                memoryHelper.saveCurrentConversationToMemory(userId, tenantId);
                log.info("[AiAgent] 自动保存L3对话记忆 (turn #{})", turnCount);
            }));
        }

        // P2升级: 安全护栏 — Guardrails-as-Code输出内容检查
        com.fashion.supplychain.intelligence.service.GuardrailsConfigService guardrailsConfigService = guardrailsConfigServiceProvider.getIfAvailable();
        if (guardrailsConfigService != null && assistantResponse != null) {
            String blockReason = guardrailsConfigService.checkOutput(assistantResponse);
            if (blockReason != null) {
                log.warn("[AiAgent-Guardrails] 输出被拦截: {} — reason: {}", conversationId, blockReason);
            }
        }

        // P2升级: 结构化输出后处理 — 修复模糊表述、重复段落、过长单行
        com.fashion.supplychain.intelligence.service.StructuredOutputEnforcer outputEnforcer = outputEnforcerProvider.getIfAvailable();
        if (outputEnforcer != null && assistantResponse != null) {
            try {
                String processed = outputEnforcer.postProcess(assistantResponse);
                if (!processed.equals(assistantResponse)) {
                    log.debug("[AiAgent-OutputEnforcer] 已修复回答格式问题 conversationId={}", conversationId);
                }
            } catch (Exception e) {
                log.debug("[AiAgent-OutputEnforcer] 后处理跳过: {}", e.getMessage());
            }
        }

        if (toolRecords != null && !toolRecords.isEmpty() && !usedQuickPath) {
            final String finalToolResults = toolResultsStr;
            postTurnExecutor.execute(UserContext.wrap(() -> {
                learnEntityMemoryFromTools(tenantId, finalToolResults);
            }));
            // P1升级: 记录成功工具调用模式到程序记忆
            if (selfScore > 80) {
                List<String> pmToolNames = toolRecords.stream()
                        .map(r -> r.toolName).distinct().toList();
                memoryHelper.recordProceduralPattern(userMessage, pmToolNames, selfScore);
            }
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
            com.fashion.supplychain.intelligence.service.KnowledgeBaseService knowledgeBaseService = knowledgeBaseServiceProvider.getIfAvailable();
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
            com.fashion.supplychain.intelligence.helper.PromptTemplateLoader promptTemplateLoader = promptTemplateLoaderProvider.getIfAvailable();
            String identity = promptTemplateLoader != null ? promptTemplateLoader.getBaseIdentity() : null;
            if (identity == null || identity.isBlank()) {
                identity = "你是小云——服装供应链首席运营顾问，由云裳智链Trivia团队开发。";
            }
            sysPrompt.append(identity).append("\n\n");
            String principles = promptTemplateLoader != null ? promptTemplateLoader.getBasePrinciples() : null;
            if (principles != null && !principles.isBlank()) {
                sysPrompt.append(principles).append("\n\n");
            }
            com.fashion.supplychain.intelligence.helper.AiAgentPromptHelper aiAgentPromptHelper = aiAgentPromptHelperProvider.getIfAvailable();
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
            com.fashion.supplychain.intelligence.service.MemoryBankService memoryBankService = memoryBankServiceProvider.getIfAvailable();
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
            com.fashion.supplychain.intelligence.service.EntityMemoryContextService entityMemoryContextService = entityMemoryContextServiceProvider.getIfAvailable();
            if (entityMemoryContextService != null) {
                try {
                    Long memTenantId = UserContext.tenantId();
                    if (memTenantId != null) {
                        String entityMemCtx = entityMemoryContextService.buildEntityMemoryContext(memTenantId, userMessage);
                        if (!entityMemCtx.isBlank()) {
                            sysPrompt.append("【实体记忆】\n").append(entityMemCtx).append("\n\n");
                        }
                    }
                } catch (Exception e) {
                    log.debug("[QuickPath] EntityMemory注入跳过: {}", e.getMessage());
                }
            }

            // 发送思考事件，确保前端创建消息
            emitSse(emitter, "thinking", java.util.Map.of());

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

            QuickPathQualityGate quickPathQualityGate = quickPathQualityGateProvider.getIfAvailable();
            if (quickPathQualityGate != null) {
                QuickPathQualityGate.QualityGateResult gateResult = quickPathQualityGate.review(userMessage, answer);
                if (!gateResult.isPassed()) {
                    log.warn("[QuickPath] 质量门未通过: {}，降级到Agent循环", gateResult.getReason());
                    return false;
                }
            }

            // 发送最终 answer 事件，确保前端能解析卡片等结构化内容
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

    private boolean isComplexQuestion(String userMessage) {
        if (userMessage == null || userMessage.isBlank()) return false;
        String lower = userMessage.toLowerCase();
        int complexityScore = 0;
        if (lower.contains("分析") || lower.contains("为什么") || lower.contains("原因")) complexityScore += 2;
        if (lower.contains("预测") || lower.contains("趋势") || lower.contains("未来")) complexityScore += 2;
        if (lower.contains("比较") || lower.contains("对比") || lower.contains("差异")) complexityScore += 1;
        if (lower.contains("多个") || lower.contains("全部") || lower.contains("所有")) complexityScore += 1;
        if (lower.contains("最优") || lower.contains("方案") || lower.contains("建议")) complexityScore += 2;
        if (userMessage.length() > 150) complexityScore += 1;
        return complexityScore >= 4;
    }

    private String tryAdvancedReasoning(String userMessage, String pageContext) {
        try {
            if (!isComplexQuestion(userMessage)) {
                return null;
            }

            com.fashion.supplychain.intelligence.upgrade.phase4.GraphOfThoughtsEngine gotEngine = graphOfThoughtsEngineProvider.getIfAvailable();
            if (gotEngine != null) {
                com.fashion.supplychain.intelligence.upgrade.phase4.GraphOfThoughtsEngine.GotResult gotResult = gotEngine.reason(
                        "complex-analysis", userMessage, java.util.Collections.emptyList(), java.util.Collections.emptyList());
                if (gotResult.isSuccess() && gotResult.getConclusion() != null && !gotResult.getConclusion().isBlank()) {
                    log.info("[AdvancedReasoning] GoT推理成功，score={}", gotResult.getScore());
                    return gotResult.getConclusion();
                }
            }

            com.fashion.supplychain.intelligence.upgrade.phase3.TreeOfThoughtsEngine totEngine = treeOfThoughtsEngineProvider.getIfAvailable();
            if (totEngine != null) {
                com.fashion.supplychain.intelligence.upgrade.phase3.TreeOfThoughtsEngine.TotResult totResult = totEngine.explore(
                        "complex-analysis", userMessage, java.util.Collections.emptyList(), java.util.Collections.emptyList());
                if (totResult.isSuccess() && totResult.getBestConclusion() != null && !totResult.getBestConclusion().isBlank()) {
                    log.info("[AdvancedReasoning] ToT推理成功，score={}, explored={}", totResult.getBestScore(), totResult.getExploredPaths());
                    return totResult.getBestConclusion();
                }
            }
        } catch (Exception e) {
            log.debug("[AdvancedReasoning] 高级推理跳过: {}", e.getMessage());
        }
        return null;
    }

    private String tryIntentDrivenDag(String userMessage, String pageContext) {
        try {
            com.fashion.supplychain.intelligence.upgrade.phase3.IntentDrivenDagService intentDagService = intentDrivenDagServiceProvider.getIfAvailable();
            if (intentDagService == null) return null;

            com.fashion.supplychain.intelligence.upgrade.phase3.IntentDrivenDagService.DagPlanResult planResult =
                    intentDagService.planFromIntent("dag-execution", userMessage, java.util.Collections.emptyList());

            if (!planResult.isSuccess() || planResult.getDagGraph() == null) {
                return null;
            }

            log.info("[IntentDag] 意图解析成功: intent={}, target={}", planResult.getIntent(), planResult.getTargetEntity());

            com.fashion.supplychain.intelligence.upgrade.phase4.DagVisualizationService vizService = dagVisualizationServiceProvider.getIfAvailable();
            if (vizService != null) {
                try {
                    com.fashion.supplychain.intelligence.upgrade.phase4.DagVisualizationService.DagVisualResult vizResult =
                            vizService.visualize(planResult.getDagGraph());
                    log.debug("[IntentDag] DAG可视化生成: nodes={}, edges={}", vizResult.getNodes().size(), vizResult.getEdges().size());
                } catch (Exception e) {
                    log.debug("[IntentDag] DAG可视化跳过: {}", e.getMessage());
                }
            }

            return buildDagExecutionSummary(planResult);
        } catch (Exception e) {
            log.debug("[IntentDag] 意图驱动DAG跳过: {}", e.getMessage());
        }
        return null;
    }

    private String buildDagExecutionSummary(com.fashion.supplychain.intelligence.upgrade.phase3.IntentDrivenDagService.DagPlanResult planResult) {
        StringBuilder sb = new StringBuilder();
        sb.append("**分析计划已生成**\n\n");
        sb.append("**意图**: ").append(planResult.getIntent()).append("\n");
        if (planResult.getTargetEntity() != null) {
            sb.append("**目标**: ").append(planResult.getTargetEntity()).append("\n\n");
        }

        sb.append("**执行步骤**:\n");
        if (planResult.getDagGraph() != null) {
            int idx = 1;
            for (com.fashion.supplychain.intelligence.agent.dag.DagNode node : planResult.getDagGraph().allNodes()) {
                sb.append(idx++).append(". ").append(node.getName());
                java.util.List<String> deps = node.getDependsOn();
                if (deps != null && !deps.isEmpty()) {
                    sb.append(" (依赖: ").append(String.join(", ", deps)).append(")");
                }
                sb.append("\n");
            }
        }

        sb.append("\n正在执行分析，请稍候...");
        return sb.toString();
    }
}
