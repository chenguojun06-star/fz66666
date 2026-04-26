package com.fashion.supplychain.intelligence.agent.loop;

import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;

import java.util.List;

public interface AgentLoopCallback {

    void onThinking(int iteration, String message);

    void onToolCall(AiToolCall toolCall);

    void onToolResult(String toolName, boolean success, String summary);

    void onCriticThinking();

    void onAnswer(String content, String commandId);

    default void onAnswerChunk(String chunk) {}

    void onFollowUpActions(List<?> actions);

    void onDone();

    void onError(String message);

    void onStuckDetected();

    void onTokenBudgetExceeded(String message, String commandId);

    void onPlanMode(List<AiToolCall> toolCalls, int iteration, String content);

    void onMaxIterationsExceeded();

    void onToolExecRecords(List<AiAgentToolExecHelper.ToolExecRecord> records);
}
