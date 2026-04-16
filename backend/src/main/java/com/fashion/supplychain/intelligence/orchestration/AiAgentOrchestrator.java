package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.helper.AiAgentEvidenceHelper;
import com.fashion.supplychain.intelligence.helper.AiAgentMemoryHelper;
import com.fashion.supplychain.intelligence.helper.AiAgentPromptHelper;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import com.fashion.supplychain.intelligence.dto.FollowUpAction;
import com.fashion.supplychain.intelligence.routing.AiAgentDomainRouter;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.intelligence.service.AgentStateStore;
import com.fashion.supplychain.intelligence.service.DataTruthGuard;
import com.fashion.supplychain.intelligence.agent.tool.ToolDomain;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class AiAgentOrchestrator {

    @Autowired private AiCriticOrchestrator criticOrchestrator;
    @Autowired private XiaoyunInsightCardOrchestrator xiaoyunInsightCardOrchestrator;
    @Autowired private IntelligenceInferenceOrchestrator inferenceOrchestrator;
    @Autowired private AiAgentToolAccessService aiAgentToolAccessService;
    @Autowired private AiAgentTraceOrchestrator aiAgentTraceOrchestrator;
    @Autowired private List<AgentTool> registeredTools;

    @Autowired private AiAgentPromptHelper promptHelper;
    @Autowired private AiAgentToolExecHelper toolExecHelper;
    @Autowired private AiAgentEvidenceHelper evidenceHelper;
    @Autowired private AiAgentMemoryHelper memoryHelper;
    @Autowired private AiAgentDomainRouter domainRouter;
    @Autowired private FollowUpSuggestionEngine followUpSuggestionEngine;
    @Autowired private AgentStateStore agentStateStore;
    @Autowired private DataTruthGuard dataTruthGuard;

    private static final int STUCK_MAX_REPEAT = 3;
    private static final int CRICIC_SKIP_MAX_ITERATIONS = 2;
    private static final int CRITIC_SKIP_MAX_TOOLS = 1;
    private static final long CACHE_TTL_MS = TimeUnit.MINUTES.toMillis(5);
    private static final int CACHE_MAX_SIZE = 200;
    private final ConcurrentHashMap<String, CacheEntry> queryCache = new ConcurrentHashMap<>();

    private static class CacheEntry {
        final String result;
        final long createdAt;
        CacheEntry(String result) { this.result = result; this.createdAt = System.currentTimeMillis(); }
        boolean isExpired() { return System.currentTimeMillis() - createdAt > CACHE_TTL_MS; }
    }
    /** 单次请求 token 预算上限（prompt + completion 合计），超出后强制终止循环 */
    @Value("${xiaoyun.agent.token-budget:60000}")
    private int tokenBudget;
    private static final ObjectMapper JSON = new ObjectMapper();

    private boolean shouldSkipCritic(String userMessage, int currentIteration, int totalToolCalls) {
        if (currentIteration <= CRICIC_SKIP_MAX_ITERATIONS && totalToolCalls <= CRITIC_SKIP_MAX_TOOLS) {
            return true;
        }
        if (userMessage != null && userMessage.length() < 25
                && userMessage.matches("(?s).*(你好|hi|hello|谢谢|再见|你是谁|在吗|怎么样|辛苦了|好的|收到|明白|知道了|了解).*")) {
            return true;
        }
        if (totalToolCalls == 0 && currentIteration <= 3) {
            return true;
        }
        return false;
    }

    private final ThreadLocal<String> lastCommandIdHolder = new ThreadLocal<>();
    private final ThreadLocal<List<AiAgentToolExecHelper.ToolExecRecord>> lastToolRecordsHolder = new ThreadLocal<>();

    public Result<String> executeAgent(String userMessage) {
        if (!inferenceOrchestrator.isAnyModelEnabled()) {
            return Result.fail("智能服务暂未配置或不可用");
        }

        String commandId = aiAgentTraceOrchestrator.startRequest(userMessage);
        lastCommandIdHolder.set(commandId);
        String stateSessionId = null;
        try { // F31: finally 块强制清理 ThreadLocal，防止线程池复用泄漏
        long requestStartAt = System.currentTimeMillis();
        String userId = UserContext.userId();
        Long tenantId = UserContext.tenantId();
        try { stateSessionId = agentStateStore.createSession(tenantId, userId, userMessage); } catch (Exception e) { log.debug("[AiAgent] 状态会话创建跳过: {}", e.getMessage()); }
        List<AgentTool> visibleTools = aiAgentToolAccessService.resolveVisibleTools(registeredTools);
        // ── 领域路由裁剪：按用户意图缩减工具集，降低 token 消耗 ──
        Set<ToolDomain> domains = domainRouter.route(userMessage);
        if (!domains.isEmpty()) {
            visibleTools = aiAgentToolAccessService.filterByDomains(visibleTools, domains);
            log.info("[AiAgent] 领域路由裁剪: {} → {} 个工具", domains, visibleTools.size());
        }
        Map<String, AgentTool> visibleToolMap = toolExecHelper.toToolLookup(visibleTools);
        List<AiTool> visibleApiTools = aiAgentToolAccessService.toApiTools(visibleTools);
        List<AiMessage> messages = new ArrayList<>();
        List<JsonNode> teamDispatchCards = new ArrayList<>();
        List<JsonNode> bundleSplitCards = new ArrayList<>();
        List<JsonNode> xiaoyunInsightCards = new ArrayList<>();
        messages.add(AiMessage.system(promptHelper.buildSystemPrompt(userMessage, null, visibleTools)));
        // 加载对话记忆（最近 N 轮），超过阈值时自动 LLM 压缩
        List<AiMessage> history = memoryHelper.getConversationHistory(userId, tenantId);
        messages.addAll(memoryHelper.compactConversationHistory(history));
        messages.add(AiMessage.user(userMessage));

        int maxIterations = promptHelper.estimateMaxIterations(userMessage);
        int currentIter = 0;
        long totalTokens = 0; // Token 预算追踪
        List<String> stuckSignatures = new ArrayList<>(); // Stuck 检测：跨轮次工具调用签名
        Map<String, AiAgentToolExecHelper.ToolExecRecord> toolResultCache = new HashMap<>(); // 对话内工具结果缓存
        List<AiAgentToolExecHelper.ToolExecRecord> allExecRecords = new ArrayList<>(); // 全轮次工具执行记录（用于生成后续建议）

        while (currentIter < maxIterations) {
            currentIter++;
            log.info("[AiAgent] 开始第 {} 轮思考...", currentIter);

            // 进度感知：让 LLM 知道当前轮次，避免无效循环
            if (currentIter > 2) {
                messages.add(AiMessage.system(String.format(
                    "[进度提示] 当前第%d/%d轮。如已有足够信息请直接给出最终回答，避免重复调用工具。", currentIter, maxIterations)));
            }

            IntelligenceInferenceResult result = inferenceOrchestrator.chat("agent-loop", messages, visibleApiTools);
            if (!result.isSuccess()) {
                log.error("[AiAgent] 推理失败: {}", result.getErrorMessage());
                aiAgentTraceOrchestrator.finishRequest(commandId, null, result.getErrorMessage(), System.currentTimeMillis() - requestStartAt);
                return Result.fail("推理服务暂时不可用: " + result.getErrorMessage());
            }

            // Token 预算追踪
            totalTokens += result.getPromptTokens() + result.getCompletionTokens();
            if (totalTokens > tokenBudget) {
                log.warn("[AiAgent] Token 预算超限: {} > {}, 强制终止", totalTokens, tokenBudget);
                String budgetMsg = "抱歉，本次对话消耗的计算资源已达上限，请分步提问以获得更好的回答。";
                aiAgentTraceOrchestrator.finishRequest(commandId, budgetMsg, "token_budget_exceeded", System.currentTimeMillis() - requestStartAt);
                return Result.success(budgetMsg);
            }

            // LLM Response
            AiMessage assistantMessage = AiMessage.assistant(result.getContent());

            // Handle Tool Calls
            if (result.getToolCalls() != null && !result.getToolCalls().isEmpty()) {
                // ── Stuck 检测：连续相同工具+参数调用超过阈值则强制终止 ──
                Set<String> iterSignatures = new HashSet<>();
                for (AiToolCall tc : result.getToolCalls()) {
                    iterSignatures.add(toolExecHelper.buildStuckSignature(tc));
                }
                stuckSignatures.addAll(iterSignatures);
                if (toolExecHelper.isStuck(stuckSignatures)) {
                    log.warn("[AiAgent] Stuck 检测触发：连续 {} 轮重复相同工具调用，强制终止", STUCK_MAX_REPEAT);
                    String stuckMsg = "抱歉，我在处理过程中遇到了循环，已自动终止。请尝试换一种方式描述您的需求。";
                    aiAgentTraceOrchestrator.finishRequest(commandId, stuckMsg, "stuck_detected", System.currentTimeMillis() - requestStartAt);
                    return Result.success(stuckMsg);
                }

                assistantMessage.setTool_calls(result.getToolCalls());
                messages.add(assistantMessage);

                // ── 并发执行多工具调用 + Pre/Post Hooks ──
                List<AiAgentToolExecHelper.ToolExecRecord> execRecords = toolExecHelper.executeToolsConcurrently(result.getToolCalls(), visibleToolMap, commandId, toolResultCache);
                for (AiAgentToolExecHelper.ToolExecRecord rec : execRecords) {
                    evidenceHelper.captureTeamDispatchCard(rec.toolName, rec.rawResult, teamDispatchCards);
                    evidenceHelper.captureBundleSplitCard(rec.toolName, rec.rawResult, bundleSplitCards);
                    xiaoyunInsightCardOrchestrator.collectFromToolResult(rec.toolName, rec.rawResult, xiaoyunInsightCards);
                    messages.add(AiMessage.tool(rec.evidence, rec.toolCallId, rec.toolName));
                }
                allExecRecords.addAll(execRecords);
                if (stateSessionId != null) { try { agentStateStore.saveCheckpoint(stateSessionId, currentIter, messages, execRecords, (int) totalTokens); } catch (Exception e) { log.debug("[AiAgent] 检查点保存跳过: {}", e.getMessage()); } }
            } else {
                // Done!
                log.info("[AiAgent] 完成任务，进入自反思审查层");
                String revisedContent;
                if (shouldSkipCritic(userMessage, currentIter, allExecRecords.size())) {
                    log.info("[AiAgent] 简单场景跳过Critic审查 (iter={}, tools={})", currentIter, allExecRecords.size());
                    revisedContent = result.getContent();
                } else {
                    revisedContent = criticOrchestrator.reviewAndRevise(userMessage, result.getContent());
                }
                revisedContent = evidenceHelper.appendTeamDispatchCards(revisedContent, teamDispatchCards);
                revisedContent = evidenceHelper.appendBundleSplitCards(revisedContent, bundleSplitCards);
                revisedContent = xiaoyunInsightCardOrchestrator.appendToContent(revisedContent, xiaoyunInsightCards);

                // ── 数据真实性守卫：校验AI输出是否有工具数据支撑 ──
                String toolEvidence = allExecRecords.isEmpty() ? "" : allExecRecords.stream()
                        .map(r -> r.evidence).reduce((a, b) -> a + " " + b).orElse("");
                DataTruthGuard.TruthCheckResult truthCheck = dataTruthGuard.checkAiOutputTruth(revisedContent, toolEvidence);
                if (!truthCheck.isPassed()) {
                    log.warn("[AiAgent] 数据真实性校验未通过: {}", truthCheck.getReason());
                    revisedContent = "⚠️ " + truthCheck.getReason() + "\n\n" + revisedContent;
                }
                revisedContent = dataTruthGuard.tagDataSource(revisedContent, truthCheck.getDataSource());

                log.info("[AiAgent] 返回最终结果给用户");
                memoryHelper.saveConversationTurn(userId, tenantId, userMessage, revisedContent);
                aiAgentTraceOrchestrator.finishRequest(commandId, revisedContent, null, System.currentTimeMillis() - requestStartAt);
                // ── 租户级 AI 记忆增强：异步提取对话洞察 ──
                memoryHelper.enhanceMemoryAsync(userId, tenantId, userMessage, revisedContent);
                lastToolRecordsHolder.set(allExecRecords);
                if (stateSessionId != null) { try { agentStateStore.completeSession(stateSessionId, revisedContent, (int) totalTokens, currentIter); } catch (Exception e) { log.debug("[AiAgent] 状态完成跳过: {}", e.getMessage()); } }
                return Result.success(revisedContent);
            }
        }

        aiAgentTraceOrchestrator.finishRequest(commandId, null, "对话轮数超过限制", System.currentTimeMillis() - requestStartAt);
        if (stateSessionId != null) { try { agentStateStore.failSession(stateSessionId, "对话轮数超过限制"); } catch (Exception e) { log.debug("[AiAgent] 状态失败跳过: {}", e.getMessage()); } }
        return Result.fail("对话轮数超过限制 (" + maxIterations + ")，可能陷入了死循环。");
        } finally { // F31: 强制清理 ThreadLocal
            lastCommandIdHolder.remove();
            lastToolRecordsHolder.remove();
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


    public void executeAgentStreaming(String userMessage, String pageContext, SseEmitter emitter) {
        String commandId = null;
        String stateSessionId = null;
        long requestStartAt = System.currentTimeMillis();
        try {
            if (!inferenceOrchestrator.isAnyModelEnabled()) {
                emitSse(emitter, "error", Map.of("message", "智能服务暂未配置或不可用"));
                emitter.complete();
                return;
            }

            String cacheKey = UserContext.tenantId() + ":" + UserContext.userId() + ":" + userMessage;
            CacheEntry cached = queryCache.get(cacheKey);
            if (cached != null && !cached.isExpired()) {
                log.info("[AiAgent-Stream] 命中查询缓存，直接返回 ({}字符)", cached.result.length());
                commandId = aiAgentTraceOrchestrator.startRequest(userMessage);
                emitSse(emitter, "answer", Map.of("content", cached.result, "commandId", commandId));
                emitSse(emitter, "done", Map.of());
                aiAgentTraceOrchestrator.finishRequest(commandId, cached.result, null, System.currentTimeMillis() - requestStartAt);
                emitter.complete();
                return;
            }
            if (queryCache.size() > CACHE_MAX_SIZE) {
                queryCache.entrySet().removeIf(e -> e.getValue().isExpired());
            }

            commandId = aiAgentTraceOrchestrator.startRequest(userMessage);
            String userId = UserContext.userId();
            Long tenantId = UserContext.tenantId();
            try { stateSessionId = agentStateStore.createSession(tenantId, userId, userMessage); } catch (Exception e) { log.debug("[AiAgent-Stream] 状态会话创建跳过: {}", e.getMessage()); }
            List<AgentTool> visibleTools = aiAgentToolAccessService.resolveVisibleTools(registeredTools);
            // ── 领域路由裁剪：按用户意图缩减工具集，降低 token 消耗 ──
            Set<ToolDomain> domains = domainRouter.route(userMessage);
            if (!domains.isEmpty()) {
                visibleTools = aiAgentToolAccessService.filterByDomains(visibleTools, domains);
                log.info("[AiAgent-Stream] 领域路由裁剪: {} → {} 个工具", domains, visibleTools.size());
            }
            Map<String, AgentTool> visibleToolMap = toolExecHelper.toToolLookup(visibleTools);
            List<AiTool> visibleApiTools = aiAgentToolAccessService.toApiTools(visibleTools);
            List<AiMessage> messages = new ArrayList<>();
            List<JsonNode> teamDispatchCards = new ArrayList<>();
            List<JsonNode> bundleSplitCards = new ArrayList<>();
            List<JsonNode> xiaoyunInsightCards = new ArrayList<>();
            messages.add(AiMessage.system(promptHelper.buildSystemPrompt(userMessage, pageContext, visibleTools)));
            List<AiMessage> history = memoryHelper.getConversationHistory(userId, tenantId);
            messages.addAll(memoryHelper.compactConversationHistory(history));
            messages.add(AiMessage.user(userMessage));

            int maxIterations = promptHelper.estimateMaxIterations(userMessage);
            long totalTokens = 0; // Token 预算追踪
            List<String> stuckSignatures = new ArrayList<>(); // Stuck 检测
            Map<String, AiAgentToolExecHelper.ToolExecRecord> toolResultCache = new HashMap<>(); // 对话内工具结果缓存
            List<AiAgentToolExecHelper.ToolExecRecord> allExecRecords = new ArrayList<>(); // 全轮次工具执行记录
            for (int i = 1; i <= maxIterations; i++) {
                emitSse(emitter, "thinking", Map.of("iteration", i, "message", "正在思考第 " + i + " 轮…"));

                // 进度感知：让 LLM 知道当前轮次，避免无效循环
                if (i > 2) {
                    messages.add(AiMessage.system(String.format(
                        "[进度提示] 当前第%d/%d轮。如已有足够信息请直接给出最终回答，避免重复调用工具。", i, maxIterations)));
                }

                IntelligenceInferenceResult result = inferenceOrchestrator.chat("agent-loop", messages, visibleApiTools);
                if (!result.isSuccess()) {
                    aiAgentTraceOrchestrator.finishRequest(commandId, null, result.getErrorMessage(), System.currentTimeMillis() - requestStartAt);
                    emitSse(emitter, "error", Map.of("message", "推理服务暂时不可用: " + result.getErrorMessage()));
                    emitter.complete();
                    return;
                }

                // Token 预算追踪
                totalTokens += result.getPromptTokens() + result.getCompletionTokens();
                if (totalTokens > tokenBudget) {
                    log.warn("[AiAgent-Stream] Token 预算超限: {} > {}, 强制终止", totalTokens, tokenBudget);
                    String budgetMsg = "抱歉，本次对话消耗的计算资源已达上限，请分步提问以获得更好的回答。";
                    aiAgentTraceOrchestrator.finishRequest(commandId, budgetMsg, "token_budget_exceeded", System.currentTimeMillis() - requestStartAt);
                    emitSse(emitter, "answer", Map.of("content", budgetMsg, "commandId", commandId));
                    emitSse(emitter, "done", Map.of());
                    emitter.complete();
                    return;
                }

                AiMessage assistantMessage = AiMessage.assistant(result.getContent());

                if (result.getToolCalls() != null && !result.getToolCalls().isEmpty()) {
                    // ── Stuck 检测 ──
                    Set<String> iterSigs = new HashSet<>();
                    for (AiToolCall tc : result.getToolCalls()) {
                        iterSigs.add(toolExecHelper.buildStuckSignature(tc));
                    }
                    stuckSignatures.addAll(iterSigs);
                    if (toolExecHelper.isStuck(stuckSignatures)) {
                        log.warn("[AiAgent-Stream] Stuck 检测触发，强制终止");
                        String stuckMsg = "抱歉，我在处理过程中遇到了循环，已自动终止。请尝试换一种方式描述您的需求。";
                        aiAgentTraceOrchestrator.finishRequest(commandId, stuckMsg, "stuck_detected", System.currentTimeMillis() - requestStartAt);
                        emitSse(emitter, "answer", Map.of("content", stuckMsg, "commandId", commandId));
                        emitSse(emitter, "done", Map.of());
                        emitter.complete();
                        return;
                    }

                    assistantMessage.setTool_calls(result.getToolCalls());
                    messages.add(assistantMessage);

                    // ── 并发执行多工具调用 + Pre/Post Hooks ──
                    // 先发送所有 tool_call 事件
                    for (AiToolCall toolCall : result.getToolCalls()) {
                        emitSse(emitter, "tool_call", Map.of("tool", toolCall.getFunction().getName(), "arguments", toolCall.getFunction().getArguments()));
                    }
                    List<AiAgentToolExecHelper.ToolExecRecord> execRecords = toolExecHelper.executeToolsConcurrently(result.getToolCalls(), visibleToolMap, commandId, toolResultCache);
                    for (AiAgentToolExecHelper.ToolExecRecord rec : execRecords) {
                        evidenceHelper.captureTeamDispatchCard(rec.toolName, rec.rawResult, teamDispatchCards);
                        evidenceHelper.captureBundleSplitCard(rec.toolName, rec.rawResult, bundleSplitCards);
                        xiaoyunInsightCardOrchestrator.collectFromToolResult(rec.toolName, rec.rawResult, xiaoyunInsightCards);
                        emitSse(emitter, "tool_result", Map.of(
                                "tool", rec.toolName,
                                "success", !rec.rawResult.contains("\"error\""),
                                "summary", AiAgentEvidenceHelper.truncateOneLine(rec.evidence, 200)));
                        messages.add(AiMessage.tool(rec.evidence, rec.toolCallId, rec.toolName));
                    }
                    allExecRecords.addAll(execRecords);
                    if (stateSessionId != null) { try { agentStateStore.saveCheckpoint(stateSessionId, i, messages, execRecords, (int) totalTokens); } catch (Exception e) { log.debug("[AiAgent-Stream] 检查点保存跳过: {}", e.getMessage()); } }
                } else {
                    // == 自反思审查 ==
                    String revisedContent;
                    int streamIter = i;
                    if (shouldSkipCritic(userMessage, streamIter, allExecRecords.size())) {
                        log.info("[AiAgent-Stream] 简单场景跳过Critic审查 (iter={}, tools={})", streamIter, allExecRecords.size());
                        revisedContent = result.getContent();
                    } else {
                        emitSse(emitter, "thinking", Map.of("message", "小云正在进行最终思考核对与完善..."));
                        revisedContent = criticOrchestrator.reviewAndRevise(userMessage, result.getContent());
                    }
                    revisedContent = evidenceHelper.appendTeamDispatchCards(revisedContent, teamDispatchCards);
                    revisedContent = evidenceHelper.appendBundleSplitCards(revisedContent, bundleSplitCards);
                    revisedContent = xiaoyunInsightCardOrchestrator.appendToContent(revisedContent, xiaoyunInsightCards);

                    // ── 数据真实性守卫：校验AI输出是否有工具数据支撑 ──
                    String streamToolEvidence = allExecRecords.isEmpty() ? "" : allExecRecords.stream()
                            .map(r -> r.evidence).reduce((a, b) -> a + " " + b).orElse("");
                    DataTruthGuard.TruthCheckResult streamTruthCheck = dataTruthGuard.checkAiOutputTruth(revisedContent, streamToolEvidence);
                    if (!streamTruthCheck.isPassed()) {
                        log.warn("[AiAgent-Stream] 数据真实性校验未通过: {}", streamTruthCheck.getReason());
                        revisedContent = "⚠️ " + streamTruthCheck.getReason() + "\n\n" + revisedContent;
                    }
                    revisedContent = dataTruthGuard.tagDataSource(revisedContent, streamTruthCheck.getDataSource());

                    // 最终回答
                    memoryHelper.saveConversationTurn(userId, tenantId, userMessage, revisedContent);
                    aiAgentTraceOrchestrator.finishRequest(commandId, revisedContent, null, System.currentTimeMillis() - requestStartAt);
                    // ── 租户级 AI 记忆增强：异步提取对话洞察 ──
                    memoryHelper.enhanceMemoryAsync(userId, tenantId, userMessage, revisedContent);
                    if (stateSessionId != null) { try { agentStateStore.completeSession(stateSessionId, revisedContent, (int) totalTokens, i); } catch (Exception e) { log.debug("[AiAgent-Stream] 状态完成跳过: {}", e.getMessage()); } }
                    String dedupedContent = deduplicateAnswer(revisedContent);
                    if (allExecRecords.size() <= 2) {
                        queryCache.put(cacheKey, new CacheEntry(dedupedContent));
                    }
                    emitSse(emitter, "answer", Map.of("content", dedupedContent, "commandId", commandId));
                    // 生成上下文关联的后续建议动作
                    try {
                        List<FollowUpAction> followUps = followUpSuggestionEngine.generate(allExecRecords, userMessage);
                        if (!followUps.isEmpty()) {
                            emitSse(emitter, "follow_up_actions", Map.of("actions", followUps));
                        }
                    } catch (Exception ex) {
                        log.warn("[AiAgent-Stream] 生成后续建议失败，不影响主流程", ex);
                    }
                    emitSse(emitter, "done", Map.of());
                    emitter.complete();
                    return;
                }
            }

            aiAgentTraceOrchestrator.finishRequest(commandId, null, "对话轮数超过限制", System.currentTimeMillis() - requestStartAt);
            if (stateSessionId != null) { try { agentStateStore.failSession(stateSessionId, "对话轮数超过限制"); } catch (Exception e) { log.debug("[AiAgent-Stream] 状态失败跳过: {}", e.getMessage()); } }
            emitSse(emitter, "error", Map.of("message", "对话轮数超过限制"));
            emitter.complete();

        } catch (Exception e) {
            log.error("[AiAgent-Stream] 流式执行异常", e);
            if (commandId != null) {
                aiAgentTraceOrchestrator.finishRequest(commandId, null, e.getMessage(), System.currentTimeMillis() - requestStartAt);
            }
            if (stateSessionId != null) { try { agentStateStore.failSession(stateSessionId, e.getMessage()); } catch (Exception ex) { log.debug("[AiAgent-Stream] 状态失败跳过: {}", ex.getMessage()); } }
            try {
                emitSse(emitter, "error", Map.of("message", "系统异常: " + e.getMessage()));
                emitter.complete();
            } catch (Exception ignored) {
                emitter.completeWithError(e);
            }
        }
    }


    public void saveCurrentConversationToMemory() {
        String userId = UserContext.userId();
        Long tenantId = UserContext.tenantId();
        memoryHelper.saveCurrentConversationToMemory(userId, tenantId);
    }

    private void emitSse(SseEmitter emitter, String eventName, Map<String, Object> data) {
        try {
            emitter.send(SseEmitter.event()
                    .name(eventName)
                    .data(JSON.writeValueAsString(data)));
        } catch (Exception e) {
            log.warn("[AiAgent-Stream] 发送SSE事件失败: event={}, error={}", eventName, e.getMessage());
        }
    }

    private String deduplicateAnswer(String content) {
        if (content == null || content.length() < 20) return content;
        String[] paragraphs = content.split("\n\n+");
        if (paragraphs.length < 2) return content;
        StringBuilder sb = new StringBuilder();
        Set<String> seen = new HashSet<>();
        for (String p : paragraphs) {
            String trimmed = p.trim();
            if (trimmed.isEmpty()) continue;
            String normalized = trimmed.replaceAll("[\\s\\p{Punct}]", "");
            if (normalized.length() < 10 || seen.add(normalized)) {
                if (sb.length() > 0) sb.append("\n\n");
                sb.append(trimmed);
            } else {
                log.info("[AiAgent] 去重: 移除重复段落 ({}字符)", trimmed.length());
            }
        }
        return sb.toString();
    }

}
