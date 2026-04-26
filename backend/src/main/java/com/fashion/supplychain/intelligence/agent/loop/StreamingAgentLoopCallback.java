package com.fashion.supplychain.intelligence.agent.loop;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.helper.AiAgentMemoryHelper;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import com.fashion.supplychain.intelligence.orchestration.DecisionCardOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.LongTermMemoryOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

@Slf4j
public class StreamingAgentLoopCallback implements AgentLoopCallback {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final SseEmitter emitter;
    private final AgentLoopContext ctx;
    private final AiAgentMemoryHelper memoryHelper;
    private final DecisionCardOrchestrator decisionCardOrchestrator;
    private final LongTermMemoryOrchestrator longTermMemoryOrchestrator;

    private String finalContent;
    private List<AiAgentToolExecHelper.ToolExecRecord> execRecords;

    public StreamingAgentLoopCallback(SseEmitter emitter,
                                       AgentLoopContext ctx,
                                       AiAgentMemoryHelper memoryHelper,
                                       DecisionCardOrchestrator decisionCardOrchestrator,
                                       LongTermMemoryOrchestrator longTermMemoryOrchestrator) {
        this.emitter = emitter;
        this.ctx = ctx;
        this.memoryHelper = memoryHelper;
        this.decisionCardOrchestrator = decisionCardOrchestrator;
        this.longTermMemoryOrchestrator = longTermMemoryOrchestrator;
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
        this.finalContent = content;
        String deduped = deduplicateAnswer(content);
        emitSse("answer", Map.of("content", deduped, "commandId", commandId));

        memoryHelper.saveConversationTurn(ctx.getUserId(), ctx.getTenantId(), ctx.getUserMessage(), content);
        memoryHelper.enhanceMemoryAsync(ctx.getUserId(), ctx.getTenantId(), ctx.getUserMessage(), content);
    }

    @Override
    public void onAnswerChunk(String chunk) {
        emitSse("answer_chunk", Map.of("chunk", chunk));
    }

    @Override
    public void onFollowUpActions(List<?> actions) {
        emitSse("follow_up_actions", Map.of("actions", actions));
    }

    @Override
    public void onDone() {
        emitSse("done", Map.of());
        try { emitter.complete(); } catch (Exception e) {
            log.debug("[StreamCallback] SSE complete异常: {}", e.getMessage());
        }
    }

    @Override
    public void onError(String message) {
        emitSse("error", Map.of("message", message));
        emitSse("done", Map.of());
        try { emitter.complete(); } catch (Exception e) {
            log.debug("[StreamCallback] SSE complete异常: {}", e.getMessage());
        }
    }

    @Override
    public void onStuckDetected() {
        String stuckMsg = "抱歉，我在处理过程中遇到了循环，已自动终止。请尝试换一种方式描述您的需求。";
        emitSse("answer", Map.of("content", stuckMsg, "commandId", ctx.getCommandId()));
        emitSse("done", Map.of());
        try { emitter.complete(); } catch (Exception e) { log.debug("[StreamCallback] SSE异常", e); }
    }

    @Override
    public void onTokenBudgetExceeded(String message, String commandId) {
        emitSse("answer", Map.of("content", message, "commandId", commandId));
        emitSse("done", Map.of());
        try { emitter.complete(); } catch (Exception e) { log.debug("[StreamCallback] SSE异常", e); }
    }

    @Override
    public void onPlanMode(List<AiToolCall> toolCalls, int iteration, String content) {
        String planDesc = buildPlanDescription(toolCalls, iteration);
        String planContent = (content != null && !content.isBlank() ? content + "\n\n" : "") + planDesc;
        emitSse("answer", Map.of("content", planContent, "commandId", ctx.getCommandId()));
        emitSse("done", Map.of());
        try { emitter.complete(); } catch (Exception e) { log.debug("[StreamCallback] SSE异常", e); }
    }

    @Override
    public void onMaxIterationsExceeded() {
        emitSse("error", Map.of("message", "对话轮数超过限制"));
        emitSse("done", Map.of());
        try { emitter.complete(); } catch (Exception e) { log.debug("[StreamCallback] SSE异常", e); }
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

    private void emitSse(String eventName, Map<String, Object> data) {
        try {
            emitter.send(SseEmitter.event().name(eventName).data(JSON.writeValueAsString(data)));
        } catch (Exception e) {
            log.warn("[StreamCallback] 发送SSE事件失败: event={}, error={}", eventName, e.getMessage());
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
