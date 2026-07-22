package com.fashion.supplychain.intelligence.agent.loop;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.agent.AgentModeContext;
import com.fashion.supplychain.intelligence.agent.command.CompensableTool;
import com.fashion.supplychain.intelligence.agent.command.CompensationResult;
import com.fashion.supplychain.intelligence.agent.planning.AgentPlan;
import com.fashion.supplychain.intelligence.agent.planning.AgentPlanningEngine;
import com.fashion.supplychain.intelligence.agent.skill.AgentSkillRegistry;
import com.fashion.supplychain.intelligence.entity.AgentCheckpoint;
import com.fashion.supplychain.intelligence.agent.checkpoint.AgentCheckpointManager;
import com.fashion.supplychain.intelligence.agent.handoff.HandoffEngine;
import com.fashion.supplychain.intelligence.dto.FollowUpAction;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.helper.AiAgentEvidenceHelper;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import com.fashion.supplychain.intelligence.helper.LangfuseSpanHelper;
import com.fashion.supplychain.intelligence.helper.XiaoyunPatterns;
import com.fashion.supplychain.intelligence.gateway.AiInferenceGateway;
import com.fashion.supplychain.intelligence.orchestration.AiCriticOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.AiAgentTraceOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.CompensatingTransactionManager;
import com.fashion.supplychain.intelligence.orchestration.DecisionCardOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.FollowUpSuggestionEngine;
import com.fashion.supplychain.intelligence.orchestration.LongTermMemoryOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ProcessRewardOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.SelfCritiqueGate;
import com.fashion.supplychain.intelligence.orchestration.XiaoyunInsightCardOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.XiaoyunResponseParser;
import com.fashion.supplychain.intelligence.service.AgentStateStore;
import com.fashion.supplychain.intelligence.service.DataTruthGuard;
import com.fashion.supplychain.intelligence.service.EntityFactChecker;
import com.fashion.supplychain.intelligence.service.GroundedGenerationGuard;
import com.fashion.supplychain.intelligence.service.ModelSelectionRouter;
import com.fashion.supplychain.intelligence.service.SemanticCacheService;
import com.fashion.supplychain.intelligence.service.SelfConsistencyVerifier;
import com.fashion.supplychain.intelligence.service.ConversationMemoryService;
import com.fashion.supplychain.intelligence.service.ContextEngineeringService;
import com.fashion.supplychain.intelligence.service.StructuredResponseService;
import com.fashion.supplychain.intelligence.service.MemoryHierarchyService;
import com.fashion.supplychain.intelligence.service.ProactiveRiskDetectionService;
import com.fashion.supplychain.intelligence.service.ProactiveInsightService;
import com.fashion.supplychain.intelligence.service.PromptEvolutionService;
import com.fashion.supplychain.intelligence.service.SkillCrystallizationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ForkJoinPool;

@Slf4j
@Component
@Lazy
public class AgentLoopEngine {

    @Value("${xiaoyun.agent.data-truth-guard.enabled:true}")
    private boolean dataTruthGuardEnabled;

    @Autowired private AiInferenceGateway inferenceGateway;
    @Autowired private AiAgentToolExecHelper toolExecHelper;
    @Autowired private AiAgentEvidenceHelper evidenceHelper;
    @Autowired private AiCriticOrchestrator criticOrchestrator;
    @Autowired private XiaoyunInsightCardOrchestrator xiaoyunInsightCardOrchestrator;
    @Autowired private AiAgentTraceOrchestrator aiAgentTraceOrchestrator;
    @Autowired private FollowUpSuggestionEngine followUpSuggestionEngine;
    @Autowired private AgentStateStore agentStateStore;
    @Autowired private DataTruthGuard dataTruthGuard;
    @Autowired private EntityFactChecker entityFactChecker;
    @Autowired private GroundedGenerationGuard groundedGenerationGuard;
    @Autowired private ProcessRewardOrchestrator processRewardOrchestrator;
    @Autowired private DecisionCardOrchestrator decisionCardOrchestrator;
    @Autowired private LongTermMemoryOrchestrator longTermMemoryOrchestrator;
    @Autowired private SelfConsistencyVerifier selfConsistencyVerifier;
    @Autowired private CompensatingTransactionManager compensatingTxManager;
    @Autowired private XiaoyunResponseParser xiaoyunResponseParser;
    @Autowired private org.springframework.beans.factory.ObjectProvider<AgentPlanningEngine> planningEngineProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<ContextEngineeringService> contextEngineeringServiceProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<StructuredResponseService> structuredResponseServiceProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<MemoryHierarchyService> memoryHierarchyServiceProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<ProactiveRiskDetectionService> riskDetectionServiceProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<ProactiveInsightService> proactiveInsightServiceProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<PromptEvolutionService> promptEvolutionServiceProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<SelfCritiqueGate> selfCritiqueGateProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<AgentSkillRegistry> skillRegistryProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<AgentCheckpointManager> checkpointManagerProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<HandoffEngine> handoffEngineProvider;
    // P1升级: 意图组合引擎
    @Autowired private org.springframework.beans.factory.ObjectProvider<com.fashion.supplychain.intelligence.service.IntentCompositionService> intentCompositionServiceProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<ConversationMemoryService> conversationMemoryServiceProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<SemanticCacheService> semanticCacheServiceProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<SkillCrystallizationService> skillCrystallizationServiceProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<ModelSelectionRouter> modelSelectionRouterProvider;

    // P0-4: Langfuse 全链路 span 追踪（required=false 兼容 Langfuse 未配置场景）
    @Autowired(required = false)
    private LangfuseSpanHelper langfuseSpanHelper;

    public String run(AgentLoopContext ctx, AgentLoopCallback cb) {
        String sessionId = ctx.getCommandId();
        compensatingTxManager.beginSession(sessionId);
        try {
            // 加载跨会话对话记忆上下文
            // P0-4: span inject_memory
            try (LangfuseSpanHelper.SpanScope injectMemScope = langfuseSpanHelper == null
                    ? LangfuseSpanHelper.SpanScope.NOOP : langfuseSpanHelper.startSpan("inject_memory")) {
                injectConversationMemory(ctx);
            }

            // 语义缓存查找：命中则直接返回，跳过整个Agent循环
            // P0-4: span semantic_cache_lookup
            SemanticCacheService semanticCacheService = semanticCacheServiceProvider.getIfAvailable();
            if (semanticCacheService != null && ctx.getTenantId() != null) {
                try (LangfuseSpanHelper.SpanScope cacheScope = langfuseSpanHelper == null
                        ? LangfuseSpanHelper.SpanScope.NOOP : langfuseSpanHelper.startSpan("semantic_cache_lookup")) {
                    try {
                        String cached = semanticCacheService.lookup(ctx.getTenantId(), ctx.getUserMessage());
                        if (cached != null) {
                            log.info("[AgentLoop] 语义缓存命中，跳过Agent循环 tenantId={} queryLen={}",
                                    ctx.getTenantId(), ctx.getUserMessage().length());
                            return handleFinalAnswer(ctx, cached, cb);
                        }
                    } catch (Exception e) {
                        log.warn("[AgentLoop] 语义缓存查找异常，继续主流程: {}", e.getMessage());
                    }
                }
            }

            // 结晶化命中检查：高频问题跳过LLM直接返回（借鉴 GenericAgent Skill Crystallization）
            SkillCrystallizationService crystallizationService = skillCrystallizationServiceProvider.getIfAvailable();
            if (crystallizationService != null && ctx.getTenantId() != null) {
                try {
                    java.util.Optional<String> crystallized = crystallizationService.tryCrystallizedAnswer(
                            ctx.getTenantId(), ctx.getUserMessage());
                    if (crystallized.isPresent()) {
                        log.info("[AgentLoop] 结晶化技能命中，跳过Agent循环 tenantId={} queryLen={}",
                                ctx.getTenantId(), ctx.getUserMessage().length());
                        return handleFinalAnswer(ctx, crystallized.get(), cb);
                    }
                } catch (Exception e) {
                    log.warn("[AgentLoop] 结晶化命中检查失败，降级到正常LLM流程: {}", e.getMessage());
                }
            }

            HandoffEngine handoffEngine = handoffEngineProvider.getIfAvailable();
            HandoffEngine.HandoffResult handoffResult = tryHandoffIfNeeded(ctx, cb);
            if (handoffResult != null && handoffResult.isDelegated()) {
                return handleFinalAnswer(ctx, handoffResult.getSubAgentResult(), cb);
            }

            AgentCheckpointManager checkpointManager = checkpointManagerProvider.getIfAvailable();
            AgentCheckpoint resumeCheckpoint = null;
            if (checkpointManager != null) {
                resumeCheckpoint = checkpointManager.loadLatestCheckpoint(sessionId);
                if (resumeCheckpoint != null) {
                    log.info("[AgentLoop] 从断点恢复: thread={} iter={} resumes={}",
                            sessionId, resumeCheckpoint.getIteration(), resumeCheckpoint.getResumeCount());
                    cb.onThinking(resumeCheckpoint.getIteration(),
                            "从第" + resumeCheckpoint.getIteration() + "轮断点恢复…");
                    ctx.getMessages().add(AiMessage.system(
                            "[系统] 之前执行在第" + resumeCheckpoint.getIteration() + "轮中断。已恢复上下文，请继续完成剩余工作。"));
                    // 标记checkpoint已恢复，增加恢复次数
                    checkpointManager.markCheckpointResumed(resumeCheckpoint.getId(), 
                            resumeCheckpoint.getResumeCount() != null ? resumeCheckpoint.getResumeCount() : 0);
                }
            }

            injectPlanIfNeeded(ctx, cb);

            // ★ 接入点4：在第一次 LLM 调用前应用 per-call 模型选择
            applyModelSelection(ctx);

            String termination;
            while (ctx.getCurrentIteration() < ctx.getMaxIterations()) {
                termination = checkSessionTermination(ctx, cb);
                if (termination != null) return termination;

                ctx.incrementIteration();
                int iter = ctx.getCurrentIteration();

                // ★ Plan-and-Execute：推送计划进度
                if (ctx.isPlanAndExecuteMode()) {
                    int progress = ctx.getPlanProgressPercent();
                    int completed = ctx.getCompletedPlanSteps();
                    int total = ctx.getTotalPlanSteps();
                    cb.onThinking(iter, String.format("执行计划第%d/%d步 (%d%%)，第%d轮思考…",
                            completed, total, progress, iter));
                } else {
                    cb.onThinking(iter, "正在思考第 " + iter + " 轮…");
                }

                injectProgressHint(ctx, iter);

                // ★ Plan-and-Execute：检查是否需要重规划
                if (ctx.isPlanAndExecuteMode() && shouldReplan(ctx)) {
                    String replanResult = tryReplanning(ctx, cb, iter);
                    if (replanResult != null) return replanResult;
                }

                String turnResult = runSingleTurn(ctx, cb, iter);
                if (turnResult != null) {
                    if (checkpointManager != null) {
                        checkpointManager.deleteThreadCheckpoints(sessionId);
                    }
                    return turnResult;
                }
            }
            if (checkpointManager != null) {
                checkpointManager.deleteThreadCheckpoints(sessionId);
            }
            return handleMaxIterations(ctx, cb);
        } finally {
            compensatingTxManager.endSession(sessionId);
        }
    }

    private String checkSessionTermination(AgentLoopContext ctx, AgentLoopCallback cb) {
        if (ctx.isCancelled()) {
            log.warn("[AgentLoop] SSE断开，中断Agent执行 (iter={})", ctx.getCurrentIteration());
            aiAgentTraceOrchestrator.finishRequest(ctx.getCommandId(), null, "cancelled",
                    System.currentTimeMillis() - ctx.getRequestStartAt());
            cb.onError("连接已断开，执行已中断");
            return "cancelled";
        }
        if (ctx.isDeadlineExceeded()) {
            log.warn("[AgentLoop] 超时中断 ({}ms > {}ms)",
                    System.currentTimeMillis() - ctx.getRequestStartAt(),
                    ctx.getDeadlineMs() - ctx.getRequestStartAt());
            aiAgentTraceOrchestrator.finishRequest(ctx.getCommandId(), null, "deadline_exceeded",
                    System.currentTimeMillis() - ctx.getRequestStartAt());
            cb.onError("执行超时，已完成部分将在下次请求中使用");
            return "deadline_exceeded";
        }
        return null;
    }

    private String runSingleTurn(AgentLoopContext ctx, AgentLoopCallback cb, int iter) {
        // 推送进度事件：让前端知道当前执行到哪一步
        if (cb instanceof StreamingAgentLoopCallback streamCb) {
            int maxIter = ctx.getMaxIterations();
            int progressPercent = Math.min(100, (int) ((iter / (double) maxIter) * 100));
            streamCb.onProgress(progressPercent, "第 " + iter + "/" + maxIter + " 轮推理");
        }

        // P0-4: span llm_inference
        IntelligenceInferenceResult result;
        try (LangfuseSpanHelper.SpanScope llmScope = langfuseSpanHelper == null
                ? LangfuseSpanHelper.SpanScope.NOOP : langfuseSpanHelper.startSpan("llm_inference")) {
            result = performInference(ctx, cb, iter);
        }
        log.info("[DEBUG-AI] iter={} success={} contentLen={} toolCalls={} provider={} model={}",
                iter, result.isSuccess(),
                result.getContent() != null ? result.getContent().length() : 0,
                result.getToolCalls() != null ? result.getToolCalls().size() : 0,
                result.getProvider(), result.getModel());
        if (!result.isSuccess()) {
            log.warn("[DEBUG-AI] inference error: {}", result.getErrorMessage());
            return handleInferenceError(ctx, result, cb);
        }

        ctx.addTokens(result.getPromptTokens(), result.getCompletionTokens());
        if (ctx.isTokenBudgetExceeded()) {
            return handleTokenBudgetExceeded(ctx, cb);
        }

        AiMessage assistantMessage = AiMessage.assistant(result.getContent());
        if (result.getReasoningContent() != null && !result.getReasoningContent().isEmpty()) {
            assistantMessage.setReasoning_content(result.getReasoningContent());
        }

        if (result.getToolCalls() != null && !result.getToolCalls().isEmpty()) {
            // P0-4: span tool_execution
            try (LangfuseSpanHelper.SpanScope toolScope = langfuseSpanHelper == null
                    ? LangfuseSpanHelper.SpanScope.NOOP : langfuseSpanHelper.startSpan("tool_execution")) {
                return runToolExecutionPhase(ctx, cb, iter, assistantMessage, result);
            }
        }
        // P0-4: span final_answer
        try (LangfuseSpanHelper.SpanScope finalScope = langfuseSpanHelper == null
                ? LangfuseSpanHelper.SpanScope.NOOP : langfuseSpanHelper.startSpan("final_answer")) {
            return handleFinalAnswer(ctx, result.getContent(), cb);
        }
    }

    private IntelligenceInferenceResult performInference(AgentLoopContext ctx, AgentLoopCallback cb, int iter) {
        cb.onThinking(iter, "正在调用推理模型，请稍候…");

        // ★ 接入点4：如果是 PREMIUM 模型，使用非流式 chatWithModel（更强模型能力）
        // 否则用标准 chatStream（保持流式体验）
        if (ctx.hasModelSelection() && "PREMIUM".equals(ctx.getModelTier())) {
            try {
                return performInferenceWithModel(ctx, cb, iter);
            } catch (Exception e) {
                log.warn("[AgentLoop] PREMIUM 模型调用失败，降级到标准流式: {}", e.getMessage());
                // 降级到标准流式
            }
        }

        // 所有轮次均使用流式输出，实时推送中间思考内容，提升用户等待体验
        if (cb instanceof StreamingAgentLoopCallback) {
            return inferenceGateway.chatStream("agent-loop", ctx.getMessages(), ctx.getVisibleApiTools(),
                    (chunk, done) -> {
                        if (!chunk.isEmpty()) {
                            cb.onAnswerChunk(chunk);
                        }
                    });
        }
        return inferenceGateway.chat("agent-loop", ctx.getMessages(), ctx.getVisibleApiTools());
    }

    /**
     * 接入点4：使用 per-call 模型选择进行推理（PREMIUM 模型场景）。
     *
     * <p>当 ModelSelectionRouter 选中 PREMIUM 模型时，使用 chatWithModel 接口
     * 传递 modelId 给底层 gateway，真正实现 per-call model 覆盖。
     * 牺牲流式体验换取更强模型能力（复杂排产/多域分析场景）。
     */
    private IntelligenceInferenceResult performInferenceWithModel(AgentLoopContext ctx, AgentLoopCallback cb, int iter) {
        long start = System.currentTimeMillis();
        // 将消息列表拼接成完整 prompt
        StringBuilder promptBuilder = new StringBuilder();
        if (ctx.getMessages() != null) {
            for (AiMessage msg : ctx.getMessages()) {
                if (msg.getContent() == null) continue;
                String role = msg.getRole() != null ? msg.getRole() : "user";
                promptBuilder.append("[role:").append(role).append("]\n")
                        .append(msg.getContent()).append("\n\n");
            }
        }
        String prompt = promptBuilder.toString();

        Long tenantId = ctx.getTenantId();
        long userIdHash = ctx.getUserId() != null ? ctx.getUserId().hashCode() : 0L;
        String modelId = ctx.getModelId();

        log.info("[AgentLoop] 使用 PREMIUM 模型推理 iter={} modelId={} tenantId={}",
                iter, modelId, tenantId);

        // 调用 chatWithModel（会路由到 SpringAiInferenceAdapter 真正覆盖模型）
        String content = inferenceGateway.chatWithModel(prompt, tenantId, userIdHash, modelId);

        // 包装成 IntelligenceInferenceResult（保持下游处理一致）
        IntelligenceInferenceResult result = new IntelligenceInferenceResult();
        result.setSuccess(content != null && !content.isEmpty());
        result.setProvider("model-selection");
        result.setModel(modelId);
        result.setContent(content != null ? content : "");
        result.setLatencyMs(System.currentTimeMillis() - start);
        result.setResponseChars(content != null ? content.length() : 0);
        result.setPromptTokens(prompt.length() / 4);
        result.setCompletionTokens(content != null ? content.length() / 2 : 0);

        // 推送完整内容到前端（非流式，一次性推送）
        if (content != null && !content.isEmpty() && cb instanceof StreamingAgentLoopCallback) {
            cb.onAnswerChunk(content);
        }
        return result;
    }

    /**
     * 接入点4：在第一次 LLM 调用前应用 per-call 模型选择。
     *
     * <p>根据用户消息复杂度、预估工具调用数、多域标识自动选择模型分级：
     * <ul>
     *   <li>ECONOMY — 简单查询 → 便宜模型（保持流式）</li>
     *   <li>STANDARD — 普通对话 → 标准模型（保持流式）</li>
     *   <li>PREMIUM — 复杂排产 → 强模型（非流式，更强能力）</li>
     * </ul>
     *
     * <p>降级安全：ModelSelectionRouter 不可用时使用默认模型（不覆盖）。
     */
    private void applyModelSelection(AgentLoopContext ctx) {
        ModelSelectionRouter modelSelectionRouter = modelSelectionRouterProvider.getIfAvailable();
        if (modelSelectionRouter == null || !modelSelectionRouter.isEnabled()) {
            log.debug("[AgentLoop] ModelSelectionRouter 不可用，使用默认模型");
            return;
        }
        try {
            String userMessage = ctx.getUserMessage();
            // 预估工具调用数：根据可见工具数估算（保守估计）
            int estimatedToolCalls = ctx.getVisibleTools() != null ? ctx.getVisibleTools().size() : 0;
            // 多域标识：routedDomains.size > 1 → 多域
            boolean isMultiDomain = ctx.getRoutedDomains() != null && ctx.getRoutedDomains().size() > 1;

            ModelSelectionRouter.ModelTier tier = modelSelectionRouter.selectModel(
                    userMessage, estimatedToolCalls, isMultiDomain);
            String modelId = modelSelectionRouter.resolveModelId(tier);

            ctx.setModelTier(tier.name());
            ctx.setModelId(modelId);

            log.info("[AgentLoop] per-call 模型选择已应用: tier={} modelId={} multiDomain={} estToolCalls={}",
                    tier, modelId, isMultiDomain, estimatedToolCalls);
        } catch (Exception e) {
            log.warn("[AgentLoop] 模型选择失败，降级到默认模型（不影响主流程）: {}", e.getMessage());
        }
    }

    private String handleInferenceError(AgentLoopContext ctx, IntelligenceInferenceResult result,
                                         AgentLoopCallback cb) {
        String errMsg = "推理服务暂时不可用: " + result.getErrorMessage();
        aiAgentTraceOrchestrator.finishRequest(ctx.getCommandId(), null, result.getErrorMessage(),
                System.currentTimeMillis() - ctx.getRequestStartAt());
        cb.onError(errMsg);
        return errMsg;
    }

    private String handleTokenBudgetExceeded(AgentLoopContext ctx, AgentLoopCallback cb) {
        String budgetMsg = "今天的回答次数已消耗完成，请明天再来或联系管理员调整额度";
        log.warn("[AgentLoop] Token 预算超限: {} > {}", ctx.getTotalTokens(), ctx.getTokenBudget());
        aiAgentTraceOrchestrator.finishRequest(ctx.getCommandId(), budgetMsg, "token_budget_exceeded",
                System.currentTimeMillis() - ctx.getRequestStartAt());
        cb.onTokenBudgetExceeded(budgetMsg, ctx.getCommandId());
        return budgetMsg;
    }

    private String runToolExecutionPhase(AgentLoopContext ctx, AgentLoopCallback cb, int iter,
                                          AiMessage assistantMessage, IntelligenceInferenceResult result) {
        if (handleStuckDetection(ctx, result.getToolCalls(), cb)) {
            return "stuck_detected";
        }
        assistantMessage.setTool_calls(result.getToolCalls());
        ctx.getMessages().add(assistantMessage);

        if (AgentModeContext.isPlan()) {
            cb.onPlanMode(result.getToolCalls(), iter, result.getContent());
            return "plan_mode";
        }

        int totalTools = result.getToolCalls() != null ? result.getToolCalls().size() : 0;
        java.util.concurrent.atomic.AtomicInteger completedCount = new java.util.concurrent.atomic.AtomicInteger(0);
        for (AiToolCall toolCall : result.getToolCalls()) {
            cb.onToolCall(toolCall);
        }
        cb.onThinking(iter, String.format("正在执行工具查询(0/%d)，请稍候…", totalTools));

        // 使用流式工具执行：每完成一个就推送进度，用户能看到实时变化
        List<AiAgentToolExecHelper.ToolExecRecord> execRecords =
                toolExecHelper.executeToolsWithStreaming(
                        result.getToolCalls(), ctx.getVisibleToolMap(),
                        ctx.getCommandId(), ctx.getToolResultCache(),
                        rec -> {
                            int done = completedCount.incrementAndGet();
                            String status = (rec.rawResult != null && rec.rawResult.startsWith("{\"error\""))
                                    ? "失败"
                                    : "完成";
                            cb.onThinking(iter, String.format("正在执行工具查询(%d/%d) [%s: %s]…",
                                    done, totalTools, status, rec.toolName));
                        });

        recordCompensableExecs(ctx.getCommandId(), ctx.getVisibleToolMap(), execRecords);

        String rollbackResult = checkAndRollback(ctx, cb, execRecords);
        if (rollbackResult != null) return rollbackResult;

        processToolResults(ctx, execRecords);
        ctx.addExecRecords(execRecords);
        notifyToolResults(ctx, cb, execRecords);

        recordPrmMetrics(ctx.getCommandId(), iter, execRecords);
        saveCheckpoint(ctx, "tool_execution",
                execRecords.isEmpty() ? "none" : execRecords.get(0).toolName,
                execRecords.isEmpty() ? "" : String.valueOf(execRecords.get(0).rawResult),
                execRecords.size());
        return null;
    }

    private String checkAndRollback(AgentLoopContext ctx, AgentLoopCallback cb,
                                     List<AiAgentToolExecHelper.ToolExecRecord> execRecords) {
        boolean hasFailure = execRecords.stream()
                .anyMatch(r -> r.rawResult != null && r.rawResult.startsWith("{\"error\""));
        if (!hasFailure) {
            return null;
        }
        boolean hasCompensableInSession = compensatingTxManager.hasSession(ctx.getCommandId());
        if (!hasCompensableInSession) {
            log.debug("[AgentLoop] 工具执行有错误但当前会话无可补偿操作，跳过回滚 commandId={}", ctx.getCommandId());
            return null;
        }
        CompensationResult rollbackResult = compensatingTxManager.rollbackSession(ctx.getCommandId());
        String rollbackMsg = buildRollbackMessage(rollbackResult);
        cb.onError(rollbackMsg);
        failSession(ctx, rollbackMsg);
        return "rollback_performed";
    }

    private void notifyToolResults(AgentLoopContext ctx, AgentLoopCallback cb,
                                    List<AiAgentToolExecHelper.ToolExecRecord> execRecords) {
        for (AiAgentToolExecHelper.ToolExecRecord rec : execRecords) {
            cb.onToolResult(rec.toolName,
                    !rec.rawResult.startsWith("{\"error\""),
                    AiAgentEvidenceHelper.truncateOneLine(rec.evidence, 200));
        }
    }

    private String handleMaxIterations(AgentLoopContext ctx, AgentLoopCallback cb) {
        aiAgentTraceOrchestrator.finishRequest(ctx.getCommandId(), null, "对话轮数超过限制",
                System.currentTimeMillis() - ctx.getRequestStartAt());
        failSession(ctx, "对话轮数超过限制");
        cb.onMaxIterationsExceeded();
        return "max_iterations_exceeded";
    }

    private void injectProgressHint(AgentLoopContext ctx, int iteration) {
        if (iteration > 2) {
            ctx.getMessages().removeIf(m -> "user".equals(m.getRole())
                    && m.getContent() != null && m.getContent().startsWith("[进度提示]"));
            ctx.getMessages().add(AiMessage.user(String.format(
                    "[进度提示] 当前第%d/%d轮。如已有足够信息请直接给出最终回答，避免重复调用工具。",
                    iteration, ctx.getMaxIterations())));
        }
    }

    private boolean handleStuckDetection(AgentLoopContext ctx, List<AiToolCall> toolCalls, AgentLoopCallback cb) {
        Set<String> iterSigs = new HashSet<>();
        for (AiToolCall tc : toolCalls) {
            iterSigs.add(toolExecHelper.buildStuckSignature(tc));
        }
        ctx.addStuckSignatures(iterSigs);
        if (toolExecHelper.isStuck(ctx.getStuckSignatures())) {
            log.warn("[AgentLoop] Stuck 检测触发，强制终止");
            String stuckMsg = "抱歉，我在处理过程中遇到了循环，已自动终止。请尝试换一种方式描述您的需求。";
            aiAgentTraceOrchestrator.finishRequest(ctx.getCommandId(), stuckMsg, "stuck_detected",
                    System.currentTimeMillis() - ctx.getRequestStartAt());
            cb.onStuckDetected();
            return true;
        }
        return false;
    }

    private void processToolResults(AgentLoopContext ctx, List<AiAgentToolExecHelper.ToolExecRecord> execRecords) {
        ContextEngineeringService contextEngineeringService = contextEngineeringServiceProvider.getIfAvailable();
        for (AiAgentToolExecHelper.ToolExecRecord rec : execRecords) {
            evidenceHelper.captureTeamDispatchCard(rec.toolName, rec.rawResult, ctx.getTeamDispatchCards());
            evidenceHelper.captureBundleSplitCard(rec.toolName, rec.rawResult, ctx.getBundleSplitCards());
            evidenceHelper.captureStepWizardCard(rec.toolName, rec.rawResult, ctx.getStepWizardCards());
            evidenceHelper.captureReportPreviewCard(rec.toolName, rec.rawResult, ctx.getReportPreviewCards());
            xiaoyunInsightCardOrchestrator.collectFromToolResult(rec.toolName, rec.rawResult, ctx.getXiaoyunInsightCards());

            String summarizedEvidence = rec.evidence;
            if (contextEngineeringService != null && rec.rawResult != null && rec.rawResult.length() > 2000) {
                summarizedEvidence = contextEngineeringService.summarizeToolResult(
                        rec.toolName, rec.rawResult, ctx.getUserMessage());
            }
            ctx.getMessages().add(AiMessage.tool(summarizedEvidence, rec.toolCallId, rec.toolName));
        }
    }

    private String handleFinalAnswer(AgentLoopContext ctx, String rawContent, AgentLoopCallback cb) {
        log.info("[AgentLoop] 完成任务，进入自反思审查层");

        // ★ 关键优化：立即追加数据卡片（无LLM调用），让用户立即看到带数据的回答
        // 后续Critic审查和LLM洞察卡全部异步执行，不阻塞首次响应
        String fastContent = evidenceHelper.appendTeamDispatchCards(rawContent, ctx.getTeamDispatchCards());
        fastContent = evidenceHelper.appendBundleSplitCards(fastContent, ctx.getBundleSplitCards());
        fastContent = evidenceHelper.appendStepWizardCards(fastContent, ctx.getStepWizardCards());
        fastContent = evidenceHelper.appendReportPreviewCards(fastContent, ctx.getReportPreviewCards());
        fastContent = enrichWithRiskDetection(ctx, fastContent);
        fastContent = appendDataSourcesFooter(ctx, fastContent);

        if (fastContent == null || fastContent.isBlank()) {
            String toolSummary = ctx.getAllExecRecords().stream()
                    .map(r -> r.toolName + ": " + (r.evidence != null && r.evidence.length() > 100 ? r.evidence.substring(0, 100) + "..." : r.evidence))
                    .reduce("", (a, b) -> a.isEmpty() ? b : a + "\n" + b);
            fastContent = "抱歉，我暂时无法给出完整的分析结果。"
                    + (toolSummary.isEmpty() ? "" : "\n\n已查询到的信息：\n" + toolSummary)
                    + "\n\n请尝试换个方式描述您的问题，或联系管理员检查模型配置。";
            log.warn("[AgentLoop] 最终回答为空，工具记录={}条，返回兜底提示", ctx.getAllExecRecords().size());
        }

        // ★ 立即发送回答并关闭SSE，用户几乎零等待
        aiAgentTraceOrchestrator.finishRequest(ctx.getCommandId(), fastContent, null,
                System.currentTimeMillis() - ctx.getRequestStartAt());
        cb.onAnswer(fastContent, ctx.getCommandId());
        cb.onToolExecRecords(ctx.getAllExecRecords());

        // 语义缓存
        if (semanticCacheServiceProvider.getIfAvailable() != null && ctx.getTenantId() != null) {
            try {
                semanticCacheServiceProvider.getIfAvailable()
                        .store(ctx.getTenantId(), ctx.getUserMessage(), fastContent);
            } catch (Exception e) {
                log.debug("[AgentLoop] 语义缓存存储失败（不影响主流程）: {}", e.getMessage());
            }
        }

        // ★ 全部异步后处理：Critic审查 + Insight卡 + SelfCritiqueGate + 自我一致性 + 建议 + 记忆
        final String finalFastContent = fastContent;
        final AgentLoopCallback finalCb = cb;
        ForkJoinPool.commonPool().execute(() -> {
            try {
                asyncPostProcess(ctx, finalFastContent, finalCb);
            } catch (Exception ex) {
                log.debug("[AgentLoop] 异步后处理异常（不影响用户）: {}", ex.getMessage());
            }
        });

        return fastContent;
    }

    /**
     * 异步后处理：在SSE关闭后运行，不阻塞用户响应
     * 包含：Critic审查(LLM) + Insight卡(LLM) + SelfCritiqueGate(LLM) + 自我一致性 + 后续建议 + 记忆
     */
    private void asyncPostProcess(AgentLoopContext ctx, String fastContent, AgentLoopCallback cb) {
        String content = fastContent;

        // ★ Critic审查：最大延迟源（LLM调用约3-8秒），异步执行
        boolean shouldCritic = !XiaoyunPatterns.shouldSkipCritic(
                ctx.getUserMessage(), ctx.getAllExecRecords().size(), fastContent.length());
        if (shouldCritic) {
            try {
                cb.onCriticThinking();
                String critiquedContent = criticOrchestrator.reviewAndRevise(
                        ctx.getUserMessage(), content, ctx.getAllExecRecords());
                if (critiquedContent != null && !critiquedContent.isBlank()
                        && !critiquedContent.equals(content)) {
                    content = critiquedContent;
                }
            } catch (Exception e) {
                log.warn("[AsyncPost] Critic审查异常: {}", e.getMessage());
            }
        }

        // Insight Card Orchestrator（LLM调用，约1-3秒）
        try {
            String enrichedContent = xiaoyunInsightCardOrchestrator.appendToContent(content, ctx.getXiaoyunInsightCards());
            if (enrichedContent != null && !enrichedContent.equals(content)) {
                content = enrichedContent;
            }
        } catch (Exception e) {
            log.debug("[AsyncPost] InsightCard LLM失败: {}", e.getMessage());
        }

        // SelfCritiqueGate（LLM调用，约1-2秒）
        // P1-5：质量分作为结晶化触发依据，默认 0.80（SelfCritiqueGate 评分范围 0-100，需 /100 归一化）
        double qualityScore = 0.80;
        SelfCritiqueGate selfCritiqueGate = selfCritiqueGateProvider.getIfAvailable();
        if (selfCritiqueGate != null) {
            try {
                SelfCritiqueGate.GateResult gateResult = selfCritiqueGate.check(ctx, content);
                qualityScore = Math.max(0.0, Math.min(1.0, gateResult.getScore() / 100.0));
                if (gateResult.isHardFail()) {
                    log.warn("[AsyncPost] SelfCritiqueGate HARD_FAIL score={}", gateResult.getScore());
                    content = gateResult.getContent();
                } else if (!gateResult.isPassed()) {
                    log.info("[AsyncPost] SelfCritiqueGate SOFT_FAIL score={}", gateResult.getScore());
                    content = gateResult.getContent();
                }
            } catch (Exception e) {
                log.debug("[AsyncPost] SelfCritiqueGate 异常: {}", e.getMessage());
            }
        }

        // 数据真实性守卫（4项并行校验，纯规则无LLM，约1-3秒）
        // 包含：数据真实性 + 数字一致性 + 实体事实 + 接地率检查
        try {
            if (dataTruthGuardEnabled && ctx.getAllExecRecords() != null && !ctx.getAllExecRecords().isEmpty()) {
                String guardWarnings = runDataTruthGuards(ctx, content);
                if (guardWarnings != null && !guardWarnings.isBlank()) {
                    content += "\n" + guardWarnings;
                }
            }
        } catch (Exception e) {
            log.debug("[AsyncPost] 数据真实性守卫异常: {}", e.getMessage());
        }

        // 自我一致性验证（仅高风险工具，约1-2秒）
        try {
            boolean usedHighRiskTool = ctx.getAllExecRecords().stream()
                    .anyMatch(r -> selfConsistencyVerifier.isHighRiskScene(r.toolName));
            if (usedHighRiskTool) {
                SelfConsistencyVerifier.SelfConsistencyResult scResult =
                        selfConsistencyVerifier.verify("agent-high-risk", ctx.getMessages(), ctx.getVisibleApiTools());
                if (scResult.isVerified() && !scResult.isHighConfidence()) {
                    log.warn("[AsyncPost] Self-Consistency 一致性不足: {}",
                            String.format("%.2f", scResult.getAgreement()));
                    content += "\n\n> ⚠️ AI 自检提示：本次回答经过多路径验证，一致性较低，建议人工复核。";
                }
            }
        } catch (Exception e) {
            log.debug("[AsyncPost] SelfConsistency 异常: {}", e.getMessage());
        }

        // 后续建议（可能有LLM调用）
        try {
            List<FollowUpAction> followUps = followUpSuggestionEngine.generate(ctx.getAllExecRecords(), ctx.getUserMessage());
            if (!followUps.isEmpty()) {
                cb.onFollowUpActions(followUps);
            }
        } catch (Exception ex) {
            log.warn("[AgentLoop] 生成后续建议失败，不影响主流程", ex);
        }

        // 持久化对话记忆
        saveConversationMemory(ctx, content);

        // 异步结晶化检测：高频问题自主探索 → 执行路径结晶化 → 下次直接复用
        // detectAndCrystallize 本身为 @Async，不阻塞当前异步后处理
        SkillCrystallizationService crystallizationService = skillCrystallizationServiceProvider.getIfAvailable();
        if (crystallizationService != null && ctx.getTenantId() != null) {
            try {
                String toolCallsLog = ctx.getAllExecRecords().stream()
                        .map(r -> "tool_call: " + r.toolName)
                        .reduce("", (a, b) -> a.isEmpty() ? b : a + "\n" + b);
                // P1-5：质量分取自 SelfCritiqueGate（默认 0.80，>0.75 阈值即触发结晶化）
                crystallizationService.detectAndCrystallize(
                        ctx.getTenantId(), ctx.getCommandId(), ctx.getUserMessage(),
                        toolCallsLog, content, qualityScore);
            } catch (Exception e) {
                log.debug("[AsyncPost] 结晶化检测失败（不影响主流程）: {}", e.getMessage());
            }
        }

        completeSession(ctx, content);
    }

    private String enrichWithRiskDetection(AgentLoopContext ctx, String content) {
        ProactiveRiskDetectionService riskDetectionService = riskDetectionServiceProvider.getIfAvailable();
        if (riskDetectionService != null) {
            try {
                ProactiveRiskDetectionService.RiskScanResult respRisk =
                        riskDetectionService.scanAiResponse(ctx.getUserMessage(), content);
                if (respRisk.hasRisks()) {
                    String riskWarnings = respRisk.getRisks().stream()
                            .map(r -> "> " + r.getEmoji() + " AI自检: " + r.getDescription())
                            .reduce("", (a, b) -> a.isEmpty() ? b : a + "\n" + b);
                    if (!riskWarnings.isBlank()) {
                        content += "\n\n" + riskWarnings;
                    }
                }
            } catch (Exception e) {
                log.debug("[AgentLoop] 风险检测异常: {}", e.getMessage());
            }
        }
        return content;
    }

    private String appendDataSourcesFooter(AgentLoopContext ctx, String content) {
        if (content == null || content.isBlank()) return content;
        if (content.contains("📊 数据来源") || content.contains("💡 提示：以上回答基于模型推理")) {
            return content;
        }
        try {
            int toolCount = ctx.getAllExecRecords() == null ? 0 : ctx.getAllExecRecords().size();
            if (toolCount == 0) {
                if (XiaoyunPatterns.isGreeting(ctx.getUserMessage())) {
                    return content;
                }
                content += "\n\n---\n> 💡 提示：以上回答基于模型推理，未查询实时数据。如需准确数据请明确说明。";
                return content;
            }

            java.util.List<String> toolNames = new java.util.ArrayList<>();
            java.util.List<String> failedTools = new java.util.ArrayList<>();
            java.util.Set<String> seen = new java.util.HashSet<>();
            for (AiAgentToolExecHelper.ToolExecRecord rec : ctx.getAllExecRecords()) {
                if (rec.toolName == null) continue;
                String displayName = mapToolDisplayName(rec.toolName);
                if (seen.add(displayName)) {
                    toolNames.add(displayName);
                }
                if (isToolFailed(rec.rawResult)) {
                    if (!failedTools.contains(displayName)) {
                        failedTools.add(displayName);
                    }
                }
            }

            StringBuilder footer = new StringBuilder();
            footer.append("\n\n---\n> 📊 数据来源：");
            if (toolCount <= 2) {
                footer.append(String.join("、", toolNames));
            } else {
                footer.append("已查询 ").append(toolCount).append(" 个数据源（")
                        .append(String.join("、", toolNames)).append("）");
            }

            if (!failedTools.isEmpty()) {
                footer.append("\n> ⚠️ 部分数据查询失败（").append(String.join("、", failedTools))
                        .append("），结果可能不完整，请稍后重试。");
            }

            content += footer.toString();
        } catch (Exception e) {
            log.debug("[AgentLoop] 数据来源标识添加失败: {}", e.getMessage());
        }
        return content;
    }

    private boolean isToolFailed(String rawResult) {
        if (rawResult == null || rawResult.isBlank()) return true;
        return rawResult.contains("\"error\"")
                && !rawResult.contains("\"success\":true")
                && !rawResult.contains("\"success\": true");
    }

    private String mapToolDisplayName(String toolName) {
        if (toolName == null) return "未知工具";
        switch (toolName) {
            case "tool_production_progress": return "生产进度";
            case "tool_warehouse_stock": return "库存查询";
            case "tool_finished_product_stock": return "成品库存";
            case "tool_style_info": return "款式资料";
            case "tool_supplier": return "供应商";
            case "tool_knowledge_search": return "知识库";
            case "tool_nl_query": return "数据查询";
            case "tool_order_timeline": return "订单时间线";
            case "tool_financial_payroll": return "工资结算";
            case "tool_quality_check": return "质检数据";
            case "tool_smart_report": return "智能报表";
            default:
                if (toolName.startsWith("tool_")) {
                    return toolName.substring(5).replace("_", " ");
                }
                return toolName;
        }
    }

    private String runDataTruthGuards(AgentLoopContext ctx, String content) {
        String toolEvidence = ctx.getToolEvidence();
        StringBuilder warnings = new StringBuilder();
        try {
            java.util.concurrent.CompletableFuture<DataTruthGuard.TruthCheckResult> truthF = java.util.concurrent.CompletableFuture.supplyAsync(() -> dataTruthGuard.checkAiOutputTruth(content, toolEvidence));
            java.util.concurrent.CompletableFuture<DataTruthGuard.NumericConsistencyResult> numF = java.util.concurrent.CompletableFuture.supplyAsync(() -> dataTruthGuard.checkNumericConsistency(content, toolEvidence));
            java.util.concurrent.CompletableFuture<EntityFactChecker.FactCheckResult> factF = java.util.concurrent.CompletableFuture.supplyAsync(() -> entityFactChecker.verifyEntities(content));
            java.util.concurrent.CompletableFuture<GroundedGenerationGuard.GroundingResult> groundF = java.util.concurrent.CompletableFuture.supplyAsync(() -> groundedGenerationGuard.verify(content, ctx.getAllExecRecords()));
            java.util.concurrent.CompletableFuture.allOf(truthF, numF, factF, groundF).get(10, java.util.concurrent.TimeUnit.SECONDS);
            DataTruthGuard.TruthCheckResult truthCheck = truthF.getNow(dataTruthGuard.checkAiOutputTruth(content, toolEvidence));
            DataTruthGuard.NumericConsistencyResult numCheck = numF.getNow(dataTruthGuard.checkNumericConsistency(content, toolEvidence));
            EntityFactChecker.FactCheckResult factCheck = factF.getNow(entityFactChecker.verifyEntities(content));
            GroundedGenerationGuard.GroundingResult grounding = groundF.getNow(groundedGenerationGuard.verify(content, ctx.getAllExecRecords()));
            if (!truthCheck.isPassed()) {
                log.warn("[AgentLoop] 数据真实性校验未通过: {}", truthCheck.getReason());
                warnings.append("\n> ⚠️ 数据校验提示：").append(truthCheck.getReason());
            }
            if (!numCheck.isConsistent() && numCheck.getMismatches() != null && !numCheck.getMismatches().isEmpty()) {
                log.warn("[AgentLoop] 数字一致性校验异常: {}", numCheck.getMismatches());
                warnings.append("\n> ⚠️ 以下数字在工具返回结果中未找到，可能不准确：").append(String.join("、", numCheck.getMismatches()));
            }
            if (!factCheck.allVerified() && factCheck.phantomEntities() != null && !factCheck.phantomEntities().isEmpty()) {
                log.warn("[AgentLoop] 实体事实校验发现不存在的实体: {}", factCheck.phantomEntities());
                warnings.append("\n> ⚠️ 以下引用的实体在系统中不存在：").append(String.join("、", factCheck.phantomEntities()));
            }
            if (!grounding.passed()) {
                log.warn("[AgentLoop] 接地率检查未通过: rate={}", grounding.groundingRate());
                String gw = grounding.toWarningText();
                if (gw != null && !gw.isEmpty()) warnings.append("\n> ⚠️ ").append(gw);
            }
        } catch (Exception e) {
            log.warn("[AgentLoop] 并行数据校验异常，回退串行: {}", e.getMessage());
            return runDataTruthGuardsFallback(ctx, content);
        }
        return warnings.toString();
    }

    private String runDataTruthGuardsFallback(AgentLoopContext ctx, String content) {
        String toolEvidence = ctx.getToolEvidence();
        StringBuilder warnings = new StringBuilder();
        DataTruthGuard.TruthCheckResult truthCheck = dataTruthGuard.checkAiOutputTruth(content, toolEvidence);
        if (!truthCheck.isPassed()) {
            log.warn("[AgentLoop] 数据真实性校验未通过: {}", truthCheck.getReason());
            warnings.append("\n> ⚠️ 数据校验提示：").append(truthCheck.getReason());
        }
        DataTruthGuard.NumericConsistencyResult numCheck = dataTruthGuard.checkNumericConsistency(content, toolEvidence);
        if (!numCheck.isConsistent() && numCheck.getMismatches() != null && !numCheck.getMismatches().isEmpty()) {
            log.warn("[AgentLoop] 数字一致性校验异常: {}", numCheck.getMismatches());
            warnings.append("\n> ⚠️ 以下数字在工具返回结果中未找到，可能不准确：").append(String.join("、", numCheck.getMismatches()));
        }
        EntityFactChecker.FactCheckResult factCheck = entityFactChecker.verifyEntities(content);
        if (!factCheck.allVerified() && factCheck.phantomEntities() != null && !factCheck.phantomEntities().isEmpty()) {
            log.warn("[AgentLoop] 实体事实校验发现不存在的实体: {}", factCheck.phantomEntities());
            warnings.append("\n> ⚠️ 以下引用的实体在系统中不存在：").append(String.join("、", factCheck.phantomEntities()));
        }
        GroundedGenerationGuard.GroundingResult grounding = groundedGenerationGuard.verify(content, ctx.getAllExecRecords());
        if (!grounding.passed()) {
            log.warn("[AgentLoop] 接地率检查未通过: rate={}", grounding.groundingRate());
            String gw = grounding.toWarningText();
            if (gw != null && !gw.isEmpty()) warnings.append("\n> ⚠️ ").append(gw);
        }
        return warnings.toString();
    }

    private void recordPrmMetrics(String commandId, int iteration, List<AiAgentToolExecHelper.ToolExecRecord> execRecords) {
        try {
            for (int ri = 0; ri < execRecords.size(); ri++) {
                AiAgentToolExecHelper.ToolExecRecord rec = execRecords.get(ri);
                boolean ok = rec.rawResult != null && !rec.rawResult.startsWith("{\"error\"");
                processRewardOrchestrator.record(commandId, null, iteration * 10 + ri,
                        rec.toolName, "",
                        rec.evidence == null ? "" : rec.evidence.length() > 500 ? rec.evidence.substring(0, 500) : rec.evidence,
                        ok ? 1 : -1, null, "AUTO", ok ? "success" : "error",
                        null, null, "agent_loop");
            }
        } catch (Exception e) {
            log.debug("[AgentLoop] PRM埋点跳过: {}", e.getMessage());
        }
    }

    private void completeSession(AgentLoopContext ctx, String content) {
        if (ctx.getStateSessionId() != null) {
            try {
                agentStateStore.completeSession(ctx.getStateSessionId(), content,
                        (int) ctx.getTotalTokens(), ctx.getCurrentIteration());
            } catch (Exception e) {
                log.debug("[AgentLoop] 状态完成跳过: {}", e.getMessage());
            }
        }
        try {
            var structured = xiaoyunResponseParser.parse(content);
            ctx.setStructuredResponse(structured);
        } catch (Exception e) {
            log.debug("[AgentLoop] 结构化解析跳过: {}", e.getMessage());
        }
    }

    private void failSession(AgentLoopContext ctx, String reason) {
        if (ctx.getStateSessionId() != null) {
            try {
                agentStateStore.failSession(ctx.getStateSessionId(), reason);
            } catch (Exception e) {
                log.debug("[AgentLoop] 状态失败跳过: {}", e.getMessage());
            }
        }
    }

    private void recordCompensableExecs(String sessionId,
                                         Map<String, com.fashion.supplychain.intelligence.agent.tool.AgentTool> toolMap,
                                         List<AiAgentToolExecHelper.ToolExecRecord> execRecords) {
        for (AiAgentToolExecHelper.ToolExecRecord rec : execRecords) {
            if (rec.rawResult == null || rec.rawResult.startsWith("{\"error\"")) {
                continue;
            }
            com.fashion.supplychain.intelligence.agent.tool.AgentTool tool = toolMap.get(rec.toolName);
            if (tool instanceof CompensableTool && ((CompensableTool) tool).isCompensable()) {
                Map<String, Object> snapshot = new LinkedHashMap<>();
                snapshot.put("toolName", rec.toolName);
                snapshot.put("execResult", rec.rawResult);
                snapshot.put("toolDef", tool.getName());
                compensatingTxManager.recordExecution(sessionId, rec.toolName,
                        (CompensableTool) tool, snapshot);
            }
        }
    }

    private void injectPlanIfNeeded(AgentLoopContext ctx, AgentLoopCallback cb) {
        AgentPlanningEngine planningEngine = planningEngineProvider.getIfAvailable();
        ProactiveRiskDetectionService riskDetectionService = riskDetectionServiceProvider.getIfAvailable();
        MemoryHierarchyService memoryHierarchyService = memoryHierarchyServiceProvider.getIfAvailable();
        AgentSkillRegistry skillRegistry = skillRegistryProvider.getIfAvailable();
        if (planningEngine == null) return;
        try {
            java.util.List<java.util.Map<String, Object>> toolsForPlanning = new java.util.ArrayList<>();
            for (com.fashion.supplychain.intelligence.agent.AiTool tool : ctx.getVisibleApiTools()) {
                java.util.Map<String, Object> toolMap = new java.util.LinkedHashMap<>();
                toolMap.put("name", tool.getFunction() != null ? tool.getFunction().getName() : "");
                toolMap.put("description", tool.getFunction() != null ? tool.getFunction().getDescription() : "");
                toolMap.put("domain", "general");
                toolsForPlanning.add(toolMap);
            }
            AgentPlanningEngine.PlanResult planResult = planningEngine.analyzeAndPlan(
                    ctx.getUserMessage(), toolsForPlanning, ctx.getPageContext());

            if (planResult.isSkip()) {
                log.debug("[AgentLoop] 规划跳过: {}", planResult.getSkipReason());
            } else {
                String planInjection = planResult.toPromptInjection();
                if (!planInjection.isBlank() && planResult.getPlan() != null) {
                    ctx.getMessages().add(1, AiMessage.system(planInjection));
                    // ★ Plan-and-Execute 模式：设置当前计划，启用进度跟踪
                    ctx.setCurrentPlan(planResult.getPlan());

                    if (planResult.getRiskLevel() != null
                            && ("high".equals(planResult.getRiskLevel()) || "critical".equals(planResult.getRiskLevel()))) {
                        cb.onThinking(0, "高风险任务，已启动详细规划与验证模式");
                    }

                    log.info("[AgentLoop] 规划已注入（Plan-and-Execute模式）: complexity={} steps={} riskLevel={}",
                            planResult.getComplexityScore(),
                            planResult.getPlan().getStepCount(),
                            planResult.getRiskLevel());
                }
            }

            if (riskDetectionService != null) {
                ProactiveRiskDetectionService.RiskScanResult riskScan =
                        riskDetectionService.scanUserMessage(ctx.getUserMessage());
                if (riskScan.hasRisks()) {
                    String riskInjection = riskScan.toPromptInjection();
                    if (!riskInjection.isBlank()) {
                        ctx.getMessages().add(1, AiMessage.system(riskInjection));
                        log.info("[AgentLoop] 风险扫描已注入: level={} risks={}",
                                riskScan.getOverallRiskLevel(), riskScan.getRisks().size());
                    }
                }
            }

            if (memoryHierarchyService != null && ctx.getTenantId() != null) {
                String memoryInjection = memoryHierarchyService.buildMemoryPromptInjection(
                        ctx.getTenantId(), ctx.getUserMessage(), 500);
                if (!memoryInjection.isBlank()) {
                    ctx.getMessages().add(1, AiMessage.system(memoryInjection));
                    log.debug("[AgentLoop] 记忆上下文已注入");
                }
            }

            if (skillRegistry != null) {
                String skillInjection = skillRegistry.buildSkillInjection(ctx.getUserMessage());
                if (!skillInjection.isBlank()) {
                    ctx.getMessages().add(AiMessage.system(skillInjection));
                    log.info("[AgentLoop] 技能包已注入: {} skills matched",
                            skillRegistry.matchSkills(ctx.getUserMessage()).size());
                }
            }

            // 主动洞察注入：将巡检发现的风险注入到AI上下文中
            ProactiveInsightService proactiveInsightService = proactiveInsightServiceProvider.getIfAvailable();
            if (proactiveInsightService != null && ctx.getTenantId() != null) {
                // 升级：使用相关性匹配，只注入与用户问题相关的洞察
                String insightInjection = proactiveInsightService.buildRelevantInsightInjection(
                        ctx.getTenantId(), ctx.getUserMessage());
                if (!insightInjection.isBlank()) {
                    ctx.getMessages().add(1, AiMessage.system(insightInjection));
                    log.info("[AgentLoop] 主动洞察已注入（相关性匹配）: tenant={}", ctx.getTenantId());
                }
            }

            // ★ 意图组合引擎：检测多意图并注入结构化提示
            com.fashion.supplychain.intelligence.service.IntentCompositionService intentCompositionService =
                    intentCompositionServiceProvider.getIfAvailable();
            if (intentCompositionService != null) {
                com.fashion.supplychain.intelligence.service.IntentCompositionService.MultiIntentDetectionResult multiIntent =
                        intentCompositionService.detectMultiIntent(ctx.getUserMessage());
                if (multiIntent.isMultiIntent() && multiIntent.getIntentCount() >= 2) {
                    StringBuilder intentHint = new StringBuilder();
                    intentHint.append("【系统提示：检测到您的问题包含").append(multiIntent.getIntentCount()).append("个独立子问题】\n");
                    intentHint.append("子问题清单：\n");
                    for (int i = 0; i < multiIntent.getIntents().size(); i++) {
                        intentHint.append("  ").append(i + 1).append(". ").append(multiIntent.getIntents().get(i)).append("\n");
                    }
                    intentHint.append("请逐一回答每个子问题，回答结构清晰，用编号或小标题区分。\n");
                    ctx.getMessages().add(1, AiMessage.system(intentHint.toString()));
                    log.info("[AgentLoop] 多意图已注入: {}个子问题", multiIntent.getIntentCount());
                }
            }

        } catch (Exception e) {
            log.warn("[AgentLoop] 规划/风险/记忆/技能注入失败（继续执行）: {}", e.getMessage());
        }
    }

    private HandoffEngine.HandoffResult tryHandoffIfNeeded(AgentLoopContext ctx, AgentLoopCallback cb) {
        HandoffEngine handoffEngine = handoffEngineProvider.getIfAvailable();
        if (handoffEngine == null) return null;
        try {
            return handoffEngine.tryHandoff(ctx.getUserMessage(), ctx, cb);
        } catch (Exception e) {
            log.warn("[AgentLoop] Handoff尝试失败（继续主Agent执行）: {}", e.getMessage());
            return null;
        }
    }

    // ==================== Plan-and-Execute 重规划机制 ====================

    /** 最大重规划次数（防止无限重规划） */
    private static final int MAX_REPLAN_COUNT = 2;

    /**
     * 判断是否需要重规划。
     * <p>触发条件（满足任一）：
     * <ul>
     *   <li>执行了3轮以上但计划进度未推进</li>
     *   <li>工具调用出现连续失败</li>
     *   <li>当前步骤的验证标准未达到</li>
     * </ul>
     */
    private boolean shouldReplan(AgentLoopContext ctx) {
        if (ctx.getReplanCount() >= MAX_REPLAN_COUNT) return false;
        if (!ctx.isPlanAndExecuteMode()) return false;

        AgentPlan plan = ctx.getCurrentPlan();
        if (plan == null || plan.getSteps() == null) return false;

        int iter = ctx.getCurrentIteration();
        int completed = ctx.getCompletedPlanSteps();
        int totalSteps = plan.getStepCount();

        // 条件1：执行了多轮但进度没推进（每步平均>2轮还没完成）
        if (iter > 3 && completed < Math.max(1, iter / 3)) {
            log.info("[PlanReplan] 触发重规划：进度缓慢 iter={} completed={}/{}", iter, completed, totalSteps);
            return true;
        }

        // 条件2：连续工具失败（最近2次执行都有错误）
        List<AiAgentToolExecHelper.ToolExecRecord> records = ctx.getAllExecRecords();
        if (records.size() >= 2) {
            long recentFailures = records.stream()
                    .skip(Math.max(0, records.size() - 2))
                    .filter(r -> r.rawResult != null && r.rawResult.startsWith("{\"error\""))
                    .count();
            if (recentFailures >= 2) {
                log.info("[PlanReplan] 触发重规划：连续工具失败 recentFailures={}", recentFailures);
                return true;
            }
        }

        return false;
    }

    /**
     * 执行重规划。
     * <p>重新调用 PlanningEngine，基于当前执行状态生成新计划。
     */
    private String tryReplanning(AgentLoopContext ctx, AgentLoopCallback cb, int iter) {
        AgentPlanningEngine planningEngine = planningEngineProvider.getIfAvailable();
        if (planningEngine == null) return null;

        try {
            ctx.incrementReplanCount();
            cb.onThinking(iter, String.format("执行路径偏离预期，正在重新规划（第%d/%d次）…",
                    ctx.getReplanCount(), MAX_REPLAN_COUNT));

            // 构建当前执行状态描述
            StringBuilder statusBuilder = new StringBuilder();
            statusBuilder.append("当前执行进度：已完成 ").append(ctx.getCompletedPlanSteps())
                    .append("/").append(ctx.getTotalPlanSteps()).append(" 步\n");
            statusBuilder.append("已调用工具：").append(ctx.getAllExecRecords().size()).append(" 次\n");
            statusBuilder.append("已获取的信息：\n");
            for (AiAgentToolExecHelper.ToolExecRecord rec : ctx.getAllExecRecords()) {
                String shortResult = rec.evidence != null && rec.evidence.length() > 100
                        ? rec.evidence.substring(0, 100) + "..."
                        : (rec.evidence != null ? rec.evidence : "");
                statusBuilder.append("- ").append(rec.toolName).append(": ").append(shortResult).append("\n");
            }

            // 重新规划（传入页面上下文 + 当前状态）
            java.util.List<java.util.Map<String, Object>> toolsForPlanning = new java.util.ArrayList<>();
            for (com.fashion.supplychain.intelligence.agent.AiTool tool : ctx.getVisibleApiTools()) {
                java.util.Map<String, Object> toolMap = new java.util.LinkedHashMap<>();
                toolMap.put("name", tool.getFunction() != null ? tool.getFunction().getName() : "");
                toolMap.put("description", tool.getFunction() != null ? tool.getFunction().getDescription() : "");
                toolMap.put("domain", "general");
                toolsForPlanning.add(toolMap);
            }

            String replanUserMessage = ctx.getUserMessage()
                    + "\n\n【当前执行状态】\n" + statusBuilder
                    + "\n请根据已获取的信息重新规划剩余步骤。";

            AgentPlanningEngine.PlanResult replanResult = planningEngine.analyzeAndPlan(
                    replanUserMessage, toolsForPlanning, ctx.getPageContext());

            if (replanResult.isSkip() || replanResult.getPlan() == null) {
                log.info("[PlanReplan] 重规划跳过: {}", replanResult.getSkipReason());
                return null;
            }

            // 更新计划
            ctx.setCurrentPlan(replanResult.getPlan());
            // 注入新计划到消息列表
            String planInjection = replanResult.toPromptInjection();
            if (!planInjection.isBlank()) {
                ctx.getMessages().add(AiMessage.system(
                        "【系统】执行路径已调整，以下是更新后的执行计划：\n" + planInjection
                                + "\n请按照新计划继续执行。"));
            }

            log.info("[PlanReplan] 重规划完成: steps={} complexity={}",
                    replanResult.getPlan().getStepCount(), replanResult.getComplexityScore());

            return null;  // 继续执行
        } catch (Exception e) {
            log.warn("[PlanReplan] 重规划异常，继续原计划: {}", e.getMessage());
            return null;
        }
    }

    private void saveCheckpoint(AgentLoopContext ctx, String lastAction, String lastToolName,
                                 String lastToolResult, int toolCallCount) {
        AgentCheckpointManager checkpointManager = checkpointManagerProvider.getIfAvailable();
        if (checkpointManager == null) return;
        try {
            checkpointManager.saveCheckpoint(
                    ctx.getCommandId(),
                    ctx.getTenantId() != null ? ctx.getTenantId() : 0L,
                    ctx.getCurrentIteration(),
                    lastAction,
                    lastToolName,
                    lastToolResult,
                    toolCallCount,
                    ctx.getTotalTokens()
            );
        } catch (Exception e) {
            log.debug("[AgentLoop] Checkpoint保存失败（非致命）: {}", e.getMessage());
        }
    }

    private String buildRollbackMessage(CompensationResult result) {
        if (result.isSuccess()) {
            return "操作已成功回滚（" + String.join(", ", result.getRolledBack()) + "）";
        }
        StringBuilder sb = new StringBuilder("⚠️ 部分操作回滚失败，请联系管理员核查：\n");
        if (!result.getRolledBack().isEmpty()) {
            sb.append("• 已回滚: ").append(String.join(", ", result.getRolledBack())).append("\n");
        }
        if (!result.getFailed().isEmpty()) {
            sb.append("• 回滚失败: ").append(String.join(", ", result.getFailed())).append("\n");
        }
        if (!result.getUnrecoverable().isEmpty()) {
            sb.append("• 无法回滚: ").append(String.join(", ", result.getUnrecoverable())).append("\n");
        }
        return sb.toString().trim();
    }

    /**
     * 注入跨会话对话记忆上下文到消息列表
     */
    private void injectConversationMemory(AgentLoopContext ctx) {
        if (ctx.getTenantId() == null || ctx.getUserId() == null) return;
        ConversationMemoryService convMemory = conversationMemoryServiceProvider.getIfAvailable();
        if (convMemory == null) return;
        try {
            String conversationContext = convMemory.loadConversationContext(ctx.getTenantId(), ctx.getUserId());
            if (conversationContext != null && !conversationContext.isBlank()) {
                ctx.getMessages().add(1, AiMessage.system(
                        "【跨会话对话记忆】\n" + conversationContext +
                        "\n（以上为历史对话记忆，关键数据请通过工具查询确认）"));
                log.debug("[AgentLoop] 跨会话对话记忆已注入: tenant={} user={}", ctx.getTenantId(), ctx.getUserId());
            }
        } catch (Exception e) {
            log.debug("[AgentLoop] 对话记忆注入失败（静默降级）: {}", e.getMessage());
        }
    }

    /**
     * 保存对话轮次到跨会话记忆
     */
    private void saveConversationMemory(AgentLoopContext ctx, String assistantContent) {
        if (ctx.getTenantId() == null || ctx.getUserId() == null) return;
        ConversationMemoryService convMemory = conversationMemoryServiceProvider.getIfAvailable();
        if (convMemory == null) return;
        try {
            convMemory.saveTurn(ctx.getTenantId(), ctx.getUserId(), ctx.getUserMessage(), assistantContent);
        } catch (Exception e) {
            log.debug("[AgentLoop] 对话记忆保存失败（不影响主流程）: {}", e.getMessage());
        }
    }
}
