package com.fashion.supplychain.intelligence.agent.loop;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.agent.AgentModeContext;
import com.fashion.supplychain.intelligence.agent.command.CompensableTool;
import com.fashion.supplychain.intelligence.agent.command.CompensationResult;
import com.fashion.supplychain.intelligence.agent.planning.AgentPlanningEngine;
import com.fashion.supplychain.intelligence.agent.skill.AgentSkillRegistry;
import com.fashion.supplychain.intelligence.entity.AgentCheckpoint;
import com.fashion.supplychain.intelligence.agent.checkpoint.AgentCheckpointManager;
import com.fashion.supplychain.intelligence.agent.handoff.HandoffEngine;
import com.fashion.supplychain.intelligence.dto.FollowUpAction;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.helper.AiAgentEvidenceHelper;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
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
import com.fashion.supplychain.intelligence.service.SemanticCacheService;
import com.fashion.supplychain.intelligence.service.SelfConsistencyVerifier;
import com.fashion.supplychain.intelligence.service.ConversationMemoryService;
import com.fashion.supplychain.intelligence.service.ContextEngineeringService;
import com.fashion.supplychain.intelligence.service.StructuredResponseService;
import com.fashion.supplychain.intelligence.service.MemoryHierarchyService;
import com.fashion.supplychain.intelligence.service.ProactiveRiskDetectionService;
import com.fashion.supplychain.intelligence.service.ProactiveInsightService;
import com.fashion.supplychain.intelligence.service.PromptEvolutionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Component
@Lazy
public class AgentLoopEngine {

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
    @Autowired private org.springframework.beans.factory.ObjectProvider<ConversationMemoryService> conversationMemoryServiceProvider;
    @Autowired private org.springframework.beans.factory.ObjectProvider<SemanticCacheService> semanticCacheServiceProvider;

    public String run(AgentLoopContext ctx, AgentLoopCallback cb) {
        String sessionId = ctx.getCommandId();
        compensatingTxManager.beginSession(sessionId);
        try {
            // 加载跨会话对话记忆上下文
            injectConversationMemory(ctx);

            // 语义缓存查找：命中则直接返回，跳过整个Agent循环
            SemanticCacheService semanticCacheService = semanticCacheServiceProvider.getIfAvailable();
            if (semanticCacheService != null && ctx.getTenantId() != null) {
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

            String termination;
            while (ctx.getCurrentIteration() < ctx.getMaxIterations()) {
                termination = checkSessionTermination(ctx, cb);
                if (termination != null) return termination;

                ctx.incrementIteration();
                int iter = ctx.getCurrentIteration();
                cb.onThinking(iter, "正在思考第 " + iter + " 轮…");
                injectProgressHint(ctx, iter);

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

        IntelligenceInferenceResult result = performInference(ctx, cb, iter);
        if (!result.isSuccess()) {
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
            return runToolExecutionPhase(ctx, cb, iter, assistantMessage, result);
        }
        return handleFinalAnswer(ctx, result.getContent(), cb);
    }

    private IntelligenceInferenceResult performInference(AgentLoopContext ctx, AgentLoopCallback cb, int iter) {
        cb.onThinking(iter, "正在调用推理模型，请稍候…");

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

        for (AiToolCall toolCall : result.getToolCalls()) {
            cb.onToolCall(toolCall);
        }
        cb.onThinking(iter, "正在执行工具查询，请稍候…");

        List<AiAgentToolExecHelper.ToolExecRecord> execRecords =
                toolExecHelper.executeToolsConcurrently(
                        result.getToolCalls(), ctx.getVisibleToolMap(),
                        ctx.getCommandId(), ctx.getToolResultCache());

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
        String revisedContent;

        if (XiaoyunPatterns.shouldSkipCritic(ctx.getUserMessage(), ctx.getAllExecRecords().size(), rawContent.length())) {
            log.info("[AgentLoop] 简单场景跳过Critic审查 (iter={}, tools={})",
                    ctx.getCurrentIteration(), ctx.getAllExecRecords().size());
            revisedContent = rawContent;
        } else {
            cb.onCriticThinking();
            try {
                revisedContent = criticOrchestrator.reviewAndRevise(
                        ctx.getUserMessage(), rawContent, ctx.getAllExecRecords());
            } catch (Exception e) {
                log.warn("[AgentLoop] Critic审查异常，使用原始回答: {}", e.getMessage());
                revisedContent = rawContent;
            }
        }

        revisedContent = evidenceHelper.appendTeamDispatchCards(revisedContent, ctx.getTeamDispatchCards());
        revisedContent = evidenceHelper.appendBundleSplitCards(revisedContent, ctx.getBundleSplitCards());
        revisedContent = evidenceHelper.appendStepWizardCards(revisedContent, ctx.getStepWizardCards());
        revisedContent = evidenceHelper.appendReportPreviewCards(revisedContent, ctx.getReportPreviewCards());
        revisedContent = xiaoyunInsightCardOrchestrator.appendToContent(revisedContent, ctx.getXiaoyunInsightCards());

        // SelfCritiqueGate：输出前硬门控（≤1轮，不达标降级，符合 AI Hard Limit）
        SelfCritiqueGate selfCritiqueGate = selfCritiqueGateProvider.getIfAvailable();
        if (selfCritiqueGate != null) {
            try {
                SelfCritiqueGate.GateResult gateResult = selfCritiqueGate.check(ctx, revisedContent);
                if (gateResult.isHardFail()) {
                    log.warn("[AgentLoop] SelfCritiqueGate HARD_FAIL，使用兜底回复 score={}", gateResult.getScore());
                    revisedContent = gateResult.getContent();
                } else if (!gateResult.isPassed()) {
                    log.info("[AgentLoop] SelfCritiqueGate SOFT_FAIL，已加免责声明 score={}", gateResult.getScore());
                    revisedContent = gateResult.getContent();
                }
            } catch (Exception e) {
                log.debug("[AgentLoop] SelfCritiqueGate 异常，放行: {}", e.getMessage());
            }
        }

        String guardWarnings = runDataTruthGuards(ctx, revisedContent);
        if (!guardWarnings.isEmpty()) {
            revisedContent += guardWarnings;
        }

        StructuredResponseService structuredResponseService = structuredResponseServiceProvider.getIfAvailable();
        if (structuredResponseService != null) {
            revisedContent = structuredResponseService.enrichWithStructuredFormat(revisedContent);
        }

        ProactiveRiskDetectionService riskDetectionService = riskDetectionServiceProvider.getIfAvailable();
        if (riskDetectionService != null) {
            ProactiveRiskDetectionService.RiskScanResult respRisk =
                    riskDetectionService.scanAiResponse(ctx.getUserMessage(), revisedContent);
            if (respRisk.hasRisks()) {
                String riskWarnings = respRisk.getRisks().stream()
                        .map(r -> "> " + r.getEmoji() + " AI自检: " + r.getDescription())
                        .reduce("", (a, b) -> a.isEmpty() ? b : a + "\n" + b);
                if (!riskWarnings.isBlank()) {
                    revisedContent += "\n\n" + riskWarnings;
                }
            }
        }

        PromptEvolutionService promptEvolutionService = promptEvolutionServiceProvider.getIfAvailable();
        if (promptEvolutionService != null && ctx.getTenantId() != null) {
            promptEvolutionService.recordFeedback(
                    ctx.getCommandId(), ctx.getUserMessage(), revisedContent, 75.0, null);
        }

        boolean usedHighRiskTool = ctx.getAllExecRecords().stream()
                .anyMatch(r -> selfConsistencyVerifier.isHighRiskScene(r.toolName));
        if (usedHighRiskTool) {
            SelfConsistencyVerifier.SelfConsistencyResult scResult =
                    selfConsistencyVerifier.verify("agent-high-risk", ctx.getMessages(), ctx.getVisibleApiTools());
            if (scResult.isVerified() && !scResult.isHighConfidence()) {
                log.warn("[AgentLoop] Self-Consistency 一致性不足: agreement={}/{}={}",
                        scResult.getSuccessCount(), scResult.getSampleCount(),
                        String.format("%.2f", scResult.getAgreement()));
                revisedContent += "\n\n> ⚠️ AI 自检提示：本次回答经过多路径验证，一致性较低，建议人工复核。";
            } else if (scResult.isVerified() && scResult.isHighConfidence()) {
                log.info("[AgentLoop] Self-Consistency 验证通过: agreement={}",
                        String.format("%.2f", scResult.getAgreement()));
            }
        }

        if (revisedContent == null || revisedContent.isBlank()) {
            String toolSummary = ctx.getAllExecRecords().stream()
                    .map(r -> r.toolName + ": " + (r.evidence != null && r.evidence.length() > 100 ? r.evidence.substring(0, 100) + "..." : r.evidence))
                    .reduce("", (a, b) -> a.isEmpty() ? b : a + "\n" + b);
            revisedContent = "抱歉，我暂时无法给出完整的分析结果。"
                    + (toolSummary.isEmpty() ? "" : "\n\n已查询到的信息：\n" + toolSummary)
                    + "\n\n请尝试换个方式描述您的问题，或联系管理员检查模型配置。";
            log.warn("[AgentLoop] 最终回答为空，工具记录={}条，返回兜底提示", ctx.getAllExecRecords().size());
        }

        aiAgentTraceOrchestrator.finishRequest(ctx.getCommandId(), revisedContent, null,
                System.currentTimeMillis() - ctx.getRequestStartAt());

        cb.onAnswer(revisedContent, ctx.getCommandId());
        cb.onToolExecRecords(ctx.getAllExecRecords());

        // 语义缓存存储：将最终回答写入缓存
        if (semanticCacheServiceProvider.getIfAvailable() != null && ctx.getTenantId() != null) {
            try {
                semanticCacheServiceProvider.getIfAvailable()
                        .store(ctx.getTenantId(), ctx.getUserMessage(), revisedContent);
            } catch (Exception e) {
                log.debug("[AgentLoop] 语义缓存存储失败（不影响主流程）: {}", e.getMessage());
            }
        }

        try {
            List<FollowUpAction> followUps = followUpSuggestionEngine.generate(ctx.getAllExecRecords(), ctx.getUserMessage());
            if (!followUps.isEmpty()) {
                cb.onFollowUpActions(followUps);
            }
        } catch (Exception ex) {
            log.warn("[AgentLoop] 生成后续建议失败，不影响主流程", ex);
        }

        // 持久化对话记忆到 Redis（跨会话保持）
        saveConversationMemory(ctx, revisedContent);

        completeSession(ctx, revisedContent);
        return revisedContent;
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
                if (!planInjection.isBlank()) {
                    ctx.getMessages().add(1, AiMessage.system(planInjection));

                    if (planResult.getRiskLevel() != null
                            && ("high".equals(planResult.getRiskLevel()) || "critical".equals(planResult.getRiskLevel()))) {
                        cb.onThinking(0, "高风险任务，已启动详细规划与验证模式");
                    }

                    log.info("[AgentLoop] 规划已注入: complexity={} steps={} riskLevel={}",
                            planResult.getComplexityScore(),
                            planResult.getPlan() != null ? planResult.getPlan().getStepCount() : 0,
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
                String insightInjection = proactiveInsightService.buildInsightInjection(ctx.getTenantId());
                if (!insightInjection.isBlank()) {
                    ctx.getMessages().add(1, AiMessage.system(insightInjection));
                    log.info("[AgentLoop] 主动洞察已注入: tenant={}", ctx.getTenantId());
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
