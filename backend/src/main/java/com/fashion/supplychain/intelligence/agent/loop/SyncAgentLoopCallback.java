package com.fashion.supplychain.intelligence.agent.loop;

import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.helper.AiAgentMemoryHelper;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import com.fashion.supplychain.intelligence.orchestration.DecisionCardOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.LongTermMemoryOrchestrator;
import lombok.extern.slf4j.Slf4j;

import java.util.Collections;
import java.util.List;

@Slf4j
public class SyncAgentLoopCallback implements AgentLoopCallback {

    private final AiAgentMemoryHelper memoryHelper;
    private final DecisionCardOrchestrator decisionCardOrchestrator;
    private final LongTermMemoryOrchestrator longTermMemoryOrchestrator;
    private final AgentLoopContext ctx;

    private String finalContent;
    private List<AiAgentToolExecHelper.ToolExecRecord> execRecords = Collections.emptyList();

    public SyncAgentLoopCallback(AgentLoopContext ctx,
                                  AiAgentMemoryHelper memoryHelper,
                                  DecisionCardOrchestrator decisionCardOrchestrator,
                                  LongTermMemoryOrchestrator longTermMemoryOrchestrator) {
        this.ctx = ctx;
        this.memoryHelper = memoryHelper;
        this.decisionCardOrchestrator = decisionCardOrchestrator;
        this.longTermMemoryOrchestrator = longTermMemoryOrchestrator;
    }

    @Override public void onThinking(int iteration, String message) { }
    @Override public void onToolCall(AiToolCall toolCall) { }
    @Override public void onToolResult(String toolName, boolean success, String summary) { }
    @Override public void onCriticThinking() { }
    @Override public void onFollowUpActions(List<?> actions) { }
    @Override public void onStuckDetected() { }
    @Override public void onMaxIterationsExceeded() { }

    @Override
    public void onAnswer(String content, String commandId) {
        this.finalContent = content;
        memoryHelper.saveConversationTurn(ctx.getUserId(), ctx.getTenantId(), ctx.getUserMessage(), content);
        memoryHelper.enhanceMemoryAsync(ctx.getUserId(), ctx.getTenantId(), ctx.getUserMessage(), content);
    }

    @Override
    public void onDone() { }

    @Override
    public void onError(String message) { }

    @Override
    public void onTokenBudgetExceeded(String message, String commandId) {
        this.finalContent = message;
    }

    @Override
    public void onPlanMode(List<AiToolCall> toolCalls, int iteration, String content) { }

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
            log.debug("[SyncCallback] 决策卡埋点跳过: {}", e.getMessage());
        }
    }

    private void recordLongTermMemory(List<AiAgentToolExecHelper.ToolExecRecord> records) {
        try {
            String memContent = "Q: " + (ctx.getUserMessage().length() > 200 ? ctx.getUserMessage().substring(0, 200) : ctx.getUserMessage())
                    + "\nA: " + (finalContent != null && finalContent.length() > 500 ? finalContent.substring(0, 500) : finalContent);
            longTermMemoryOrchestrator.writeTenantMemory("EPISODIC", "user", ctx.getUserId(),
                    null, memContent, null, null, ctx.getCommandId());
        } catch (Exception e) {
            log.debug("[SyncCallback] 长期记忆埋点跳过: {}", e.getMessage());
        }
    }
}
