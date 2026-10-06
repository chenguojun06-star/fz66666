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

    /**
     * D-702：异步后处理完成后，把「审查改进后的答案」补发给用户。
     *
     * <p><b>为什么需要</b>：首次回答发出后，Critic 审查 / SelfCritiqueGate /
     * 数据真实性守卫还会跑 5~30 秒并产出更好的内容，但此前这些结果<b>只写进会话历史，
     * 从未发给用户</b>——用户永远看不到自己那份已经算好的改进版，
     * 数据真实性守卫的警告也同样看不到（守卫等于白跑）。
     *
     * <p>前端 {@code answer} 事件是<b>整段替换</b>消息内容，因此收到第二个
     * {@code answer} 会自然地把气泡升级为审查后的版本，用户无感。
     *
     * <p>默认空实现：同步回调（SyncAgentLoopCallback）无 SSE 可补发，保持原行为。
     *
     * @param content 审查改进后的完整内容
     * @param commandId 关联的命令ID
     */
    default void onRefinedAnswer(String content, String commandId) {}

    /**
     * D-702：异步后处理结束，无论成功失败都必须调用，用于释放 SSE。
     *
     * <p>首次回答后 SSE 不再立即关闭（要留通道给补发），
     * 因此需要一个明确的收尾信号；否则连接会一直挂到 SSE 超时。
     * 默认空实现，同步回调无需处理。
     */
    default void onPostProcessFinished() {}

    void onFollowUpActions(List<?> actions);

    void onDone();

    void onError(String message);

    void onStuckDetected();

    void onTokenBudgetExceeded(String message, String commandId);

    void onPlanMode(List<AiToolCall> toolCalls, int iteration, String content);

    void onMaxIterationsExceeded();

    void onToolExecRecords(List<AiAgentToolExecHelper.ToolExecRecord> records);
}
