package com.fashion.supplychain.intelligence.agent.loop;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.helper.AiAgentMemoryHelper;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import com.fashion.supplychain.intelligence.orchestration.DecisionCardOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.LongTermMemoryOrchestrator;
import com.fashion.supplychain.intelligence.service.GuardrailsConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Slf4j
public class StreamingAgentLoopCallback implements AgentLoopCallback {

    private static final ObjectMapper JSON = new ObjectMapper();

    /**
     * D-702：后处理最长等待时间。
     *
     * <p>实测 Critic 3~8s、InsightCard 1~3s、SelfCritiqueGate 1~2s
     * （含低分重试会更久），留 25s 余量。取 25s 而非更长有两个原因：
     * <ul>
     *   <li>前端 {@code SSE_INACTIVITY_TIMEOUT_MS} 是 30s，超出会显得「卡住」；</li>
     *   <li>SSE 连接期间占用容器异步上下文，越短越省资源。</li>
     * </ul>
     * 超时即强制收尾——补发是「锦上添花」，绝不能让用户为了等它而干等。
     */
    private static final long POST_PROCESS_MAX_WAIT_MS = 25_000L;

    /** 守护线程，避免阻止 JVM 退出。 */
    private static final ScheduledExecutorService POST_PROCESS_SCHEDULER =
            Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "ai-postprocess-closer");
                t.setDaemon(true);
                return t;
            });

    private final SseEmitter emitter;
    private final AgentLoopContext ctx;
    private final AiAgentMemoryHelper memoryHelper;
    private final DecisionCardOrchestrator decisionCardOrchestrator;
    private final LongTermMemoryOrchestrator longTermMemoryOrchestrator;
    /** P0-4: 用于完整净化输出（剥离标记 + 敏感信息屏蔽），可为null（降级到静态stripPromptMarkers） */
    private final GuardrailsConfigService guardrailsConfigService;

    private String finalContent;
    private List<AiAgentToolExecHelper.ToolExecRecord> execRecords;
    private volatile boolean emitterClosed = false;
    /** 后处理兜底收尾定时器（D-702） */
    private volatile ScheduledFuture<?> postProcessTimer;

    public StreamingAgentLoopCallback(SseEmitter emitter,
                                       AgentLoopContext ctx,
                                       AiAgentMemoryHelper memoryHelper,
                                       DecisionCardOrchestrator decisionCardOrchestrator,
                                       LongTermMemoryOrchestrator longTermMemoryOrchestrator,
                                       GuardrailsConfigService guardrailsConfigService) {
        this.emitter = emitter;
        this.ctx = ctx;
        this.memoryHelper = memoryHelper;
        this.decisionCardOrchestrator = decisionCardOrchestrator;
        this.longTermMemoryOrchestrator = longTermMemoryOrchestrator;
        this.guardrailsConfigService = guardrailsConfigService;
    }

    @Override
    public void onThinking(int iteration, String message) {
        emitSse("thinking", Map.of("iteration", iteration, "message", message));
    }

    @Override
    public void onToolCall(AiToolCall toolCall) {
        emitSse("tool_call", Map.of("tool", toolCall.getFunction().getName(),
                "arguments", toolCall.getFunction().getArguments()));
    }

    @Override
    public void onToolResult(String toolName, boolean success, String summary) {
        emitSse("tool_result", Map.of("tool", toolName, "success", success, "summary", summary));
    }

    @Override
    public void onCriticThinking() {
        emitSse("thinking", Map.of("message", "小云正在进行最终思考核对与完善..."));
    }

    @Override
    public void onAnswer(String content, String commandId) {
        // P0-4: 完整净化输出 — 剥离 prompt 内部标记 + 应用敏感信息屏蔽，确保 SSE 发送和记忆存储的都是干净内容
        String sanitized = sanitize(deduplicateAnswer(content));
        this.finalContent = sanitized;
        emitSse("answer", Map.of("content", sanitized, "commandId", commandId));

        memoryHelper.saveConversationTurn(ctx.getUserId(), ctx.getTenantId(), ctx.getUserMessage(), sanitized);
        memoryHelper.enhanceMemoryAsync(ctx.getUserId(), ctx.getTenantId(), ctx.getUserMessage(), sanitized);

        // D-702：这里**不再立即关闭 SSE**。
        // 关闭后异步后处理算出的改进版（Critic / SelfCritiqueGate / 数据真实性守卫）
        // 就再也发不出去了——用户永远看不到自己那份已经算好的结果，守卫等于白跑。
        // 因此改为：发出答案后留一条通道，由 onRefinedAnswer 补发，
        // 最后由 onPostProcessFinished 收尾；同时挂一个安全兜底定时器，
        // 防止后处理异常/线程池拒绝导致连接悬挂到 SSE 超时。
        armPostProcessSafetyTimer();
    }

    /**
     * D-702：补发审查改进后的答案（第二个 {@code answer} 事件）。
     *
     * <p>前端对 {@code answer} 是整段替换，因此气泡会直接升级为改进版。
     * 必须在 {@code follow_up_actions} 之前发出，否则前端合并消息时
     * 可能用空值覆盖掉已收到的后续建议。
     */
    @Override
    public void onRefinedAnswer(String content, String commandId) {
        if (emitterClosed || content == null || content.isBlank()) {
            return;
        }
        String sanitized = sanitize(deduplicateAnswer(content));
        // 关键：空判断必须放在 sanitize/deduplicate **之后**。
        // 清洗会剥离 prompt 内部标记与敏感内容，原始非空不代表清洗后非空——
        // 若把空串当 answer 发出去，前端 parseAiResponse 得到空 displayText，
        // 会用「小云暂时无法给出回答」把用户已经看到的正常答案覆盖掉。
        if (sanitized == null || sanitized.isBlank()) {
            log.warn("[StreamCallback] 审查后内容清洗为空，保留已发出的答案（原始长度={}）",
                    content == null ? 0 : content.length());
            return;
        }
        if (sanitized.equals(finalContent)) {
            // 与已发出的完全一致，没必要让气泡闪一次
            return;
        }
        emitSse("answer", Map.of("content", sanitized, "commandId", commandId));
        // 同步更新 finalContent：getFinalContent() 的调用方应拿到最终版
        this.finalContent = sanitized;
        memoryHelper.saveConversationTurn(ctx.getUserId(), ctx.getTenantId(), ctx.getUserMessage(), sanitized);
    }

    @Override
    public void onPostProcessFinished() {
        cancelPostProcessSafetyTimer();
        closeEmitter();
    }

    /**
     * 安全兜底：后处理若因线程池拒绝或未走到收尾而永不调用
     * {@link #onPostProcessFinished()}，连接会悬挂到 SSE 超时（300s）。
     * 这里做一次强制收尾，保证「最多多挂 {@code POST_PROCESS_MAX_WAIT_MS}」。
     */
    private void armPostProcessSafetyTimer() {
        cancelPostProcessSafetyTimer();
        try {
            postProcessTimer = POST_PROCESS_SCHEDULER.schedule(() -> {
                if (!emitterClosed) {
                    log.info("[StreamCallback] 后处理兜底收尾（{}ms 内未收到 onPostProcessFinished）",
                            POST_PROCESS_MAX_WAIT_MS);
                    closeEmitter();
                }
            }, POST_PROCESS_MAX_WAIT_MS, TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            log.debug("[StreamCallback] 兜底定时器启动失败: {}", e.getMessage());
        }
    }

    private void cancelPostProcessSafetyTimer() {
        if (postProcessTimer != null) {
            postProcessTimer.cancel(false);
            postProcessTimer = null;
        }
    }

    /** 先发出 error/answer 等终止事件，再幂等关闭（含取消兜底定时器）。 */
    private void closeEmitterWithDone() {
        emitSse("done", Map.of());
        emitterClosed = true;
        cancelPostProcessSafetyTimer();
        try { emitter.complete(); } catch (Exception e) {
            log.debug("[StreamCallback] SSE异常", e);
        }
    }

    /** 幂等关闭 SSE。 */
    private void closeEmitter() {
        cancelPostProcessSafetyTimer();
        if (emitterClosed) {
            return;
        }
        emitterClosed = true;
        emitSseRaw("done");
        try { emitter.complete(); } catch (Exception e) {
            log.debug("[StreamCallback] SSE complete异常: {}", e.getMessage());
        }
    }

    /** 已置 emitterClosed 时仍要发出 done，故不走 emitSse 的短路判断。 */
    private void emitSseRaw(String eventName) {
        try {
            emitter.send(SseEmitter.event().name(eventName).data(JSON.writeValueAsString(Map.of())));
        } catch (Exception e) {
            log.debug("[StreamCallback] 发送 {} 失败: {}", eventName, e.getMessage());
        }
    }

    @Override
    public void onAnswerChunk(String chunk) {
        emitSse("answer_chunk", Map.of("chunk", chunk));
    }

    /** 推送进度百分比事件 — 让前端知道AI执行到哪一步了 */
    public void onProgress(int percent, String message) {
        emitSse("progress", Map.of("percent", percent, "message", message));
    }

    @Override
    public void onFollowUpActions(List<?> actions) {
        if (!emitterClosed) {
            emitSse("follow_up_actions", Map.of("actions", actions));
        }
    }

    @Override
    public void onDone() {
        closeEmitter();
    }

    @Override
    public void onError(String message) {
        if (!emitterClosed) {
            emitterClosed = true;
            emitSse("error", Map.of("message", message));
            closeEmitter();
        }
    }

    @Override
    public void onStuckDetected() {
        String stuckMsg = "抱歉，我在处理过程中遇到了循环，已自动终止。请尝试换一种方式描述您的需求。";
        emitSse("answer", Map.of("content", stuckMsg, "commandId", ctx.getCommandId()));
        closeEmitterWithDone();
    }

    @Override
    public void onTokenBudgetExceeded(String message, String commandId) {
        emitSse("answer", Map.of("content", message, "commandId", commandId));
        closeEmitterWithDone();
    }

    @Override
    public void onPlanMode(List<AiToolCall> toolCalls, int iteration, String content) {
        String planDesc = buildPlanDescription(toolCalls, iteration);
        String planContent = (content != null && !content.isBlank() ? content + "\n\n" : "") + planDesc;
        emitSse("answer", Map.of("content", planContent, "commandId", ctx.getCommandId()));
        closeEmitterWithDone();
    }

    @Override
    public void onMaxIterationsExceeded() {
        emitSse("error", Map.of("message", "对话轮数超过限制"));
        closeEmitterWithDone();
    }

    @Override
    public void onToolExecRecords(List<AiAgentToolExecHelper.ToolExecRecord> records) {
        this.execRecords = records;
        if (!records.isEmpty()) {
            recordDecisionCard(records);
            recordLongTermMemory(records);
        }
    }

    public String getFinalContent() {
        return finalContent;
    }

    public List<AiAgentToolExecHelper.ToolExecRecord> getExecRecords() {
        return execRecords;
    }

    /**
     * 终止事件是否已发出（answer / done / error / stuck / plan / 超轮数等分支）。
     * 供 Orchestrator 判断循环结束后是否还需补一条兜底回答，
     * 避免前端只剩 answer_chunk 拼出的原始文本被清洗成空 → "只有看板没有文字"。
     */
    public boolean isTerminalEmitted() {
        return emitterClosed;
    }

    private void emitSse(String eventName, Map<String, Object> data) {
        if (emitterClosed) {
            return;
        }
        try {
            emitter.send(SseEmitter.event().name(eventName).data(JSON.writeValueAsString(data)));
        } catch (Exception e) {
            String msg = e.getMessage();
            if (msg != null && msg.contains("already completed")) {
                emitterClosed = true;
                log.debug("[StreamCallback] SSE已完成，跳过事件: event={}", eventName);
            } else {
                log.warn("[StreamCallback] 发送SSE事件失败: event={}, error={}", eventName, msg);
            }
        }
    }

    private String buildPlanDescription(List<AiToolCall> toolCalls, int iteration) {
        StringBuilder sb = new StringBuilder();
        sb.append("📋 **执行方案（plan 模式，未实际执行）**\n\n");
        sb.append("以下是我计划执行的操作，如需执行请切换为默认模式或回复「确认执行」：\n\n");
        for (int i = 0; i < toolCalls.size(); i++) {
            AiToolCall tc = toolCalls.get(i);
            String toolName = tc.getFunction() != null ? tc.getFunction().getName() : "unknown";
            sb.append(String.format("**步骤 %d**：`%s`\n", i + 1, toolName));
            String args = tc.getFunction() != null ? tc.getFunction().getArguments() : null;
            if (args != null && !args.isBlank() && !"{}".equals(args.trim())) {
                String shortArgs = args.length() > 200 ? args.substring(0, 200) + "..." : args;
                sb.append(String.format("   参数：`%s`\n", shortArgs));
            }
        }
        sb.append("\n> 当前处于 **plan（计划）模式**，切换至默认模式后可实际执行上述操作。");
        return sb.toString();
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

    /**
     * P0-4: 完整净化输出 — 剥离 prompt 内部标记 + 应用敏感信息屏蔽。
     * 优先使用注入的 GuardrailsConfigService 实例（完整净化），
     * 实例不可用时降级到静态 stripPromptMarkers（仅剥离标记）。
     * 失败不阻塞主流程，返回原文。
     */
    private String sanitize(String content) {
        if (content == null || content.isEmpty()) return content;
        try {
            if (guardrailsConfigService != null) {
                return guardrailsConfigService.sanitizeOutput(content);
            }
            return GuardrailsConfigService.stripPromptMarkers(content);
        } catch (Exception e) {
            log.debug("[StreamCallback] 净化失败，返回原文: {}", e.getMessage());
            return content;
        }
    }

    private void recordDecisionCard(List<AiAgentToolExecHelper.ToolExecRecord> records) {
        try {
            String evidenceSummary = records.stream()
                    .map(r -> r.toolName + ": " + (r.evidence != null && r.evidence.length() > 200 ? r.evidence.substring(0, 200) : r.evidence))
                    .reduce("", (a, b) -> a + "\n" + b);
            decisionCardOrchestrator.create(ctx.getCommandId(), null, "agent_answer",
                    ctx.getUserMessage().length() > 500 ? ctx.getUserMessage().substring(0, 500) : ctx.getUserMessage(),
                    finalContent != null && finalContent.length() > 1000 ? finalContent.substring(0, 1000) : finalContent,
                    evidenceSummary, null, null, null, null, ctx.getCommandId());
        } catch (Exception e) {
            log.debug("[StreamCallback] 决策卡埋点跳过: {}", e.getMessage());
        }
    }

    private void recordLongTermMemory(List<AiAgentToolExecHelper.ToolExecRecord> records) {
        try {
            String memContent = "Q: " + (ctx.getUserMessage().length() > 200 ? ctx.getUserMessage().substring(0, 200) : ctx.getUserMessage())
                    + "\nA: " + (finalContent != null && finalContent.length() > 500 ? finalContent.substring(0, 500) : finalContent);
            longTermMemoryOrchestrator.writeTenantMemory("EPISODIC", "user", ctx.getUserId(),
                    null, memContent, null, null, ctx.getCommandId());
        } catch (Exception e) {
            log.debug("[StreamCallback] 长期记忆埋点跳过: {}", e.getMessage());
        }
    }
}
