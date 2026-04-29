package com.fashion.supplychain.intelligence.agent.loop;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.agent.AgentModeContext;
import com.fashion.supplychain.intelligence.dto.FollowUpAction;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.helper.AiAgentEvidenceHelper;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import com.fashion.supplychain.intelligence.gateway.AiInferenceGateway;
import com.fashion.supplychain.intelligence.gateway.StreamChunkConsumer;
import com.fashion.supplychain.intelligence.orchestration.AiCriticOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.AiAgentTraceOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.DecisionCardOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.FollowUpSuggestionEngine;
import com.fashion.supplychain.intelligence.orchestration.LongTermMemoryOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ProcessRewardOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.XiaoyunInsightCardOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.XiaoyunResponseParser;
import com.fashion.supplychain.intelligence.service.AgentStateStore;
import com.fashion.supplychain.intelligence.service.DataTruthGuard;
import com.fashion.supplychain.intelligence.service.EntityFactChecker;
import com.fashion.supplychain.intelligence.service.GroundedGenerationGuard;
import com.fashion.supplychain.intelligence.service.SelfConsistencyVerifier;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Slf4j
@Component
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
    @Autowired private XiaoyunResponseParser xiaoyunResponseParser;

    public String run(AgentLoopContext ctx, AgentLoopCallback cb) {
        cb.onThinking(0, "开始思考...");

        while (ctx.getCurrentIteration() < ctx.getMaxIterations()) {
            ctx.incrementIteration();
            int iter = ctx.getCurrentIteration();

            cb.onThinking(iter, "正在思考第 " + iter + " 轮…");
            injectProgressHint(ctx, iter);

            cb.onThinking(iter, "正在调用推理模型，请稍候…");
            IntelligenceInferenceResult result;

            boolean isLikelyFinalRound = (iter >= ctx.getMaxIterations() - 1)
                    || (iter == 1 && ctx.getMaxIterations() <= 3);

            if (isLikelyFinalRound && cb instanceof StreamingAgentLoopCallback) {
                result = inferenceGateway.chatStream("agent-loop", ctx.getMessages(), ctx.getVisibleApiTools(),
                        (chunk, done) -> {
                            if (!chunk.isEmpty()) {
                                cb.onAnswerChunk(chunk);
                            }
                        });
            } else {
                result = inferenceGateway.chat(
                        "agent-loop", ctx.getMessages(), ctx.getVisibleApiTools());
            }

            if (!result.isSuccess()) {
                String errMsg = "推理服务暂时不可用: " + result.getErrorMessage();
                aiAgentTraceOrchestrator.finishRequest(ctx.getCommandId(), null, result.getErrorMessage(),
                        System.currentTimeMillis() - ctx.getRequestStartAt());
                cb.onError(errMsg);
                return errMsg;
            }

            ctx.addTokens(result.getPromptTokens(), result.getCompletionTokens());
            if (ctx.isTokenBudgetExceeded()) {
                String budgetMsg = "抱歉，本次对话消耗的计算资源已达上限，请分步提问以获得更好的回答。";
                log.warn("[AgentLoop] Token 预算超限: {} > {}", ctx.getTotalTokens(), ctx.getTokenBudget());
                aiAgentTraceOrchestrator.finishRequest(ctx.getCommandId(), budgetMsg, "token_budget_exceeded",
                        System.currentTimeMillis() - ctx.getRequestStartAt());
                cb.onTokenBudgetExceeded(budgetMsg, ctx.getCommandId());
                return budgetMsg;
            }

            AiMessage assistantMessage = AiMessage.assistant(result.getContent());

            if (result.getToolCalls() != null && !result.getToolCalls().isEmpty()) {
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

                processToolResults(ctx, execRecords);
                ctx.addExecRecords(execRecords);

                for (AiAgentToolExecHelper.ToolExecRecord rec : execRecords) {
                    cb.onToolResult(rec.toolName,
                            !rec.rawResult.startsWith("{\"error\""),
                            AiAgentEvidenceHelper.truncateOneLine(rec.evidence, 200));
                }

                recordPrmMetrics(ctx.getCommandId(), iter, execRecords);
                saveCheckpoint(ctx);
            } else {
                return handleFinalAnswer(ctx, result.getContent(), cb);
            }
        }

        aiAgentTraceOrchestrator.finishRequest(ctx.getCommandId(), null, "对话轮数超过限制",
                System.currentTimeMillis() - ctx.getRequestStartAt());
        failSession(ctx, "对话轮数超过限制");
        cb.onMaxIterationsExceeded();
        return "max_iterations_exceeded";
    }

    private void injectProgressHint(AgentLoopContext ctx, int iteration) {
        if (iteration > 2) {
            ctx.getMessages().removeIf(m -> "system".equals(m.getRole())
                    && m.getContent() != null && m.getContent().startsWith("[进度提示]"));
            ctx.getMessages().add(AiMessage.system(String.format(
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
        for (AiAgentToolExecHelper.ToolExecRecord rec : execRecords) {
            evidenceHelper.captureTeamDispatchCard(rec.toolName, rec.rawResult, ctx.getTeamDispatchCards());
            evidenceHelper.captureBundleSplitCard(rec.toolName, rec.rawResult, ctx.getBundleSplitCards());
            evidenceHelper.captureStepWizardCard(rec.toolName, rec.rawResult, ctx.getStepWizardCards());
            evidenceHelper.captureReportPreviewCard(rec.toolName, rec.rawResult, ctx.getReportPreviewCards());
            xiaoyunInsightCardOrchestrator.collectFromToolResult(rec.toolName, rec.rawResult, ctx.getXiaoyunInsightCards());
            ctx.getMessages().add(AiMessage.tool(rec.evidence, rec.toolCallId, rec.toolName));
        }
    }

    private String handleFinalAnswer(AgentLoopContext ctx, String rawContent, AgentLoopCallback cb) {
        log.info("[AgentLoop] 完成任务，进入自反思审查层");
        String revisedContent;

        if (shouldSkipCritic(ctx.getUserMessage(), ctx.getCurrentIteration(), ctx.getAllExecRecords().size())) {
            log.info("[AgentLoop] 简单场景跳过Critic审查 (iter={}, tools={})",
                    ctx.getCurrentIteration(), ctx.getAllExecRecords().size());
            revisedContent = rawContent;
        } else {
            cb.onCriticThinking();
            revisedContent = criticOrchestrator.reviewAndRevise(
                    ctx.getUserMessage(), rawContent, ctx.getAllExecRecords());
        }

        revisedContent = evidenceHelper.appendTeamDispatchCards(revisedContent, ctx.getTeamDispatchCards());
        revisedContent = evidenceHelper.appendBundleSplitCards(revisedContent, ctx.getBundleSplitCards());
        revisedContent = evidenceHelper.appendStepWizardCards(revisedContent, ctx.getStepWizardCards());
        revisedContent = evidenceHelper.appendReportPreviewCards(revisedContent, ctx.getReportPreviewCards());
        revisedContent = xiaoyunInsightCardOrchestrator.appendToContent(revisedContent, ctx.getXiaoyunInsightCards());

        runDataTruthGuards(ctx, revisedContent);

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

        aiAgentTraceOrchestrator.finishRequest(ctx.getCommandId(), revisedContent, null,
                System.currentTimeMillis() - ctx.getRequestStartAt());

        cb.onAnswer(revisedContent, ctx.getCommandId());
        cb.onToolExecRecords(ctx.getAllExecRecords());

        try {
            List<FollowUpAction> followUps = followUpSuggestionEngine.generate(ctx.getAllExecRecords(), ctx.getUserMessage());
            if (!followUps.isEmpty()) {
                cb.onFollowUpActions(followUps);
            }
        } catch (Exception ex) {
            log.warn("[AgentLoop] 生成后续建议失败，不影响主流程", ex);
        }

        completeSession(ctx, revisedContent);
        return revisedContent;
    }

    private void runDataTruthGuards(AgentLoopContext ctx, String content) {
        String toolEvidence = ctx.getToolEvidence();
        DataTruthGuard.TruthCheckResult truthCheck = dataTruthGuard.checkAiOutputTruth(content, toolEvidence);
        if (!truthCheck.isPassed()) {
            log.warn("[AgentLoop] 数据真实性校验未通过: {}", truthCheck.getReason());
        }
        DataTruthGuard.NumericConsistencyResult numCheck = dataTruthGuard.checkNumericConsistency(content, toolEvidence);
        if (!numCheck.isConsistent()) {
            log.warn("[AgentLoop] 数字一致性校验异常: {}", numCheck.getMismatches());
        }
        EntityFactChecker.FactCheckResult factCheck = entityFactChecker.verifyEntities(content);
        if (!factCheck.allVerified()) {
            log.warn("[AgentLoop] 实体事实校验发现不存在的实体: {}", factCheck.phantomEntities());
        }
        GroundedGenerationGuard.GroundingResult grounding = groundedGenerationGuard.verify(content, ctx.getAllExecRecords());
        if (!grounding.passed()) {
            log.warn("[AgentLoop] 接地率检查未通过: rate={}", grounding.groundingRate());
        }
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

    private void saveCheckpoint(AgentLoopContext ctx) {
        if (ctx.getStateSessionId() != null) {
            try {
                agentStateStore.saveCheckpoint(ctx.getStateSessionId(), ctx.getCurrentIteration(),
                        ctx.getMessages(), ctx.getAllExecRecords(), (int) ctx.getTotalTokens());
            } catch (Exception e) {
                log.debug("[AgentLoop] 检查点保存跳过: {}", e.getMessage());
            }
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

    private boolean shouldSkipCritic(String userMessage, int currentIteration, int totalToolCalls) {
        if (userMessage != null && userMessage.length() < 15
                && userMessage.matches("(?s).*(你好|hi|hello|谢谢|再见|在吗|辛苦了|好的|收到|明白|知道了|了解).*")) {
            return true;
        }
        return totalToolCalls <= 1;
    }
}
