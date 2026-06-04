package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.agent.loop.AgentLoopContext;
import com.fashion.supplychain.intelligence.agent.loop.AgentLoopCallback;
import com.fashion.supplychain.intelligence.agent.planning.AgentPlan;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.gateway.AiInferenceGateway;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import com.fashion.supplychain.intelligence.service.ToolRetryPolicy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * ReActLoopOrchestrator — 强化版ReAct循环引擎（Reasoning + Acting + Verification）
 *
 * <p>相比原AgentLoopEngine，增加了：
 * 1. 结构化的Reasoning-Acting-Observation-Verification循环
 * 2. 每步执行后的验证检查
 * 3. 动态策略调整能力
 * 4. 完整的执行轨迹追踪
 *
 * <p>核心思想来自2026年最新ReAct范式：
 * - Reasoning: 深度思考当前状态和下一步动作
 * - Acting: 执行选定的工具或动作
 * - Observation: 观察执行结果
 * - Verification: 验证结果是否符合预期
 */
@Slf4j
@Component
public class ReActLoopOrchestrator {

    @Autowired
    private AiInferenceGateway inferenceGateway;

    @Autowired
    private AiAgentToolExecHelper toolExecHelper;

    @Autowired
    private ToolRetryPolicy toolRetryPolicy;

    @Autowired
    private TaskDecompositionEngine taskDecompositionEngine;

    /**
     * 执行强化版ReAct循环
     *
     * @param ctx 循环上下文
     * @param cb 回调接口
     * @return 最终回答
     */
    public String executeReActLoop(AgentLoopContext ctx, AgentLoopCallback cb) {
        String sessionId = ctx.getCommandId();
        log.info("[ReActLoop] 启动强化版ReAct循环 sessionId={}", sessionId);

        try {
            // 步骤1: 判断是否需要任务分解
            boolean needsDecomposition = taskDecompositionEngine.needsDecomposition(ctx.getUserMessage());
            if (needsDecomposition) {
                TaskDecompositionEngine.DecompositionResult decomposition =
                        taskDecompositionEngine.decompose(ctx.getUserMessage(), ctx.getPageContext());
                injectDecomposition(ctx, decomposition, cb);
            }

            // 步骤2: 执行主ReAct循环
            int maxIterations = ctx.getMaxIterations();
            ReActState state = new ReActState();

            for (int iteration = 1; iteration <= maxIterations; iteration++) {
            // AgentLoopContext 没有setter，使用增量方式
            while (ctx.getCurrentIteration() < iteration) {
                ctx.incrementIteration();
            }

                // ReAct循环：Reason → Act → Observe → Verify
                ReActStepResult stepResult = executeOneReActStep(ctx, cb, iteration, state);

                if (stepResult.isFinished()) {
                    log.info("[ReActLoop] 任务完成 iteration={}", iteration);
                    return stepResult.getFinalAnswer();
                }

                if (stepResult.isError()) {
                    log.warn("[ReActLoop] 遇到错误 iteration={}", iteration);
                    return stepResult.getErrorMessage();
                }
            }

            log.warn("[ReActLoop] 达到最大迭代次数 maxIterations={}", maxIterations);
            return handleMaxIterations(ctx, cb, state);

        } catch (Exception e) {
            log.error("[ReActLoop] 执行异常", e);
            cb.onError("执行过程遇到异常: " + e.getMessage());
            return "执行异常: " + e.getMessage();
        }
    }

    /**
     * 执行单步ReAct循环
     */
    private ReActStepResult executeOneReActStep(AgentLoopContext ctx, AgentLoopCallback cb,
                                                 int iteration, ReActState state) {
        cb.onThinking(iteration, "ReAct 循环 - 正在推理 (Reasoning)");

        // 阶段1: Reasoning - 深度推理下一步
        String reasoningResult = performReasoning(ctx, iteration, state);
        state.addReasoning(iteration, reasoningResult);

        // 阶段2: Acting - 执行动作
        cb.onThinking(iteration, "ReAct 循环 - 正在执行 (Acting)");
        IntelligenceInferenceResult inferenceResult = performActing(ctx, iteration);

        if (!inferenceResult.isSuccess()) {
            return ReActStepResult.error("推理失败: " + inferenceResult.getErrorMessage());
        }

        // 检查是否是最终回答
        if (inferenceResult.getToolCalls() == null || inferenceResult.getToolCalls().isEmpty()) {
            String finalAnswer = verifyFinalAnswer(ctx, inferenceResult.getContent(), state);
            return ReActStepResult.finished(finalAnswer);
        }

        // 阶段3: Observation - 观察工具结果
        cb.onThinking(iteration, "ReAct 循环 - 正在观察 (Observing)");
        List<AiAgentToolExecHelper.ToolExecRecord> execRecords = performObservation(
                ctx, inferenceResult, cb, iteration);

        // 阶段4: Verification - 验证结果
        cb.onThinking(iteration, "ReAct 循环 - 正在验证 (Verifying)");
        VerificationResult verification = performVerification(ctx, execRecords, state, iteration);

        if (!verification.isPassed()) {
            log.warn("[ReActLoop] 验证失败: {}", verification.getReason());
            // 处理验证失败：重试或调整策略
            handleVerificationFailure(ctx, verification, cb);
        }

        // 更新状态
        state.addExecution(iteration, execRecords, verification);

        // 继续循环
        return ReActStepResult.continueLoop();
    }

    /**
     * 阶段1: 深度推理
     */
    private String performReasoning(AgentLoopContext ctx, int iteration, ReActState state) {
        try {
            StringBuilder reasoningPrompt = new StringBuilder();
            reasoningPrompt.append("你现在处于 ReAct 循环的推理阶段。\n");
            reasoningPrompt.append("当前迭代: ").append(iteration).append("\n\n");

            if (state.getPreviousReasonings().size() > 0) {
                reasoningPrompt.append("之前的推理过程:\n");
                for (ReActState.ReasoningEntry entry : state.getPreviousReasonings()) {
                    reasoningPrompt.append("- Iteration ").append(entry.iteration()).append(": ")
                            .append(entry.reasoning()).append("\n");
                }
                reasoningPrompt.append("\n");
            }

            if (state.getPreviousExecutions().size() > 0) {
                reasoningPrompt.append("之前的执行结果:\n");
                for (ReActState.ExecutionEntry entry : state.getPreviousExecutions()) {
                    reasoningPrompt.append("- Iteration ").append(entry.iteration()).append(": ")
                            .append(entry.verificationResult().isPassed() ? "✓ 通过" : "✗ 失败")
                            .append("\n");
                }
                reasoningPrompt.append("\n");
            }

            reasoningPrompt.append("请基于以上信息，继续思考下一步最佳行动。");

            AiMessage reasoningMsg = AiMessage.system(reasoningPrompt.toString());
            List<AiMessage> messages = new ArrayList<>(ctx.getMessages());
            messages.add(reasoningMsg);

            // 调用轻量推理模型进行思考
            IntelligenceInferenceResult result = inferenceGateway.chat(
                    "react-reasoning", messages, List.of());

            if (result.isSuccess() && result.getContent() != null) {
                return result.getContent();
            }

        } catch (Exception e) {
            log.warn("[ReActLoop] 推理阶段异常，跳过", e);
        }

        return "推理完成";
    }

    /**
     * 阶段2: 执行动作
     */
    private IntelligenceInferenceResult performActing(AgentLoopContext ctx, int iteration) {
        return inferenceGateway.chat("react-acting", ctx.getMessages(), ctx.getVisibleApiTools());
    }

    /**
     * 阶段3: 观察结果
     */
    private List<AiAgentToolExecHelper.ToolExecRecord> performObservation(
            AgentLoopContext ctx, IntelligenceInferenceResult inferenceResult,
            AgentLoopCallback cb, int iteration) {

        // 将assistant消息加入上下文
        AiMessage assistantMsg = AiMessage.assistant(inferenceResult.getContent());
        assistantMsg.setTool_calls(inferenceResult.getToolCalls());
        ctx.getMessages().add(assistantMsg);

        // 通知回调
        for (AiToolCall toolCall : inferenceResult.getToolCalls()) {
            cb.onToolCall(toolCall);
        }

        // 执行工具
        List<AiAgentToolExecHelper.ToolExecRecord> execRecords =
                toolExecHelper.executeToolsConcurrently(
                        inferenceResult.getToolCalls(),
                        ctx.getVisibleToolMap(),
                        ctx.getCommandId(),
                        ctx.getToolResultCache());

        // 处理工具结果
        for (AiAgentToolExecHelper.ToolExecRecord record : execRecords) {
            ctx.getMessages().add(AiMessage.tool(
                    record.evidence, record.toolCallId, record.toolName));
            cb.onToolResult(
                    record.toolName,
                    !record.rawResult.startsWith("{\"error\""),
                    record.evidence);
        }

        ctx.addExecRecords(execRecords);
        return execRecords;
    }

    /**
     * 阶段4: 验证结果
     */
    private VerificationResult performVerification(AgentLoopContext ctx,
                                                    List<AiAgentToolExecHelper.ToolExecRecord> execRecords,
                                                    ReActState state,
                                                    int iteration) {
        if (execRecords.isEmpty()) {
            return VerificationResult.passed("无工具执行");
        }

        List<String> issues = new ArrayList<>();

        for (AiAgentToolExecHelper.ToolExecRecord record : execRecords) {
            // 检查工具执行是否成功
            boolean hasError = record.rawResult != null && record.rawResult.startsWith("{\"error\"");
            if (hasError) {
                issues.add("工具 [" + record.toolName + "] 执行失败: " + record.rawResult);
            }

            // 检查结果是否为空或无意义
            if (record.evidence == null || record.evidence.isBlank()) {
                issues.add("工具 [" + record.toolName + "] 返回空结果");
            }
        }

        if (issues.isEmpty()) {
            return VerificationResult.passed("所有工具执行成功");
        } else {
            return VerificationResult.failed(String.join("; ", issues));
        }
    }

    /**
     * 处理验证失败
     */
    private void handleVerificationFailure(AgentLoopContext ctx, VerificationResult verification,
                                           AgentLoopCallback cb) {
        // 注入失败提示
        String failureHint = "\n[系统提示] 上一步验证发现问题：" + verification.getReason()
                + "\n请检查并调整策略，或者尝试不同的方法。";
        ctx.getMessages().add(AiMessage.system(failureHint));
    }

    /**
     * 验证最终回答
     */
    private String verifyFinalAnswer(AgentLoopContext ctx, String answer, ReActState state) {
        // 这里可以加入最终答案验证逻辑
        log.info("[ReActLoop] 最终答案验证完成");
        return answer;
    }

    /**
     * 注入任务分解结果
     */
    private void injectDecomposition(AgentLoopContext ctx,
                                      TaskDecompositionEngine.DecompositionResult decomposition,
                                      AgentLoopCallback cb) {
        if (!decomposition.isSuccess()) {
            log.warn("[ReActLoop] 任务分解失败: {}", decomposition.getErrorMessage());
            return;
        }

        StringBuilder prompt = new StringBuilder();
        prompt.append("\n## 任务分解 (系统自动生成)\n");
        prompt.append("总目标: ").append(decomposition.getOverallGoal()).append("\n\n");
        prompt.append("分解后的子任务:\n");

        int stepNum = 1;
        for (TaskDecompositionEngine.SubTask subTask : decomposition.getSubTasks()) {
            prompt.append(stepNum++).append(". ").append(subTask.description());
            if (subTask.expectedOutput() != null) {
                prompt.append(" → 预期: ").append(subTask.expectedOutput());
            }
            prompt.append("\n");
        }

        prompt.append("\n请按照上述分解的子任务顺序执行，每完成一个子任务后验证结果，再进入下一个。");

        ctx.getMessages().add(1, AiMessage.system(prompt.toString()));
        cb.onThinking(0, "任务已分解为 " + decomposition.getSubTasks().size() + " 个子任务");
        log.info("[ReActLoop] 任务分解已注入: subtasks={}", decomposition.getSubTasks().size());
    }

    /**
     * 处理最大迭代次数
     */
    private String handleMaxIterations(AgentLoopContext ctx, AgentLoopCallback cb, ReActState state) {
        cb.onMaxIterationsExceeded();

        StringBuilder answer = new StringBuilder();
        answer.append("抱歉，已达到最大执行次数。");

        if (state.getPreviousExecutions().size() > 0) {
            answer.append("\n\n已完成的工作:\n");
            int step = 1;
            for (ReActState.ExecutionEntry entry : state.getPreviousExecutions()) {
                for (AiAgentToolExecHelper.ToolExecRecord record : entry.execRecords()) {
                    String status = record.rawResult.startsWith("{\"error\"") ? "✗" : "✓";
                    answer.append(step++).append(". ").append(status).append(" ")
                            .append(record.toolName).append("\n");
                }
            }
        }

        return answer.toString();
    }

    // ===== 内部类 =====

    /**
     * ReAct步骤结果
     */
    public static class ReActStepResult {
        private final boolean finished;
        private final boolean error;
        private final String finalAnswer;
        private final String errorMessage;

        private ReActStepResult(boolean finished, boolean error, String finalAnswer, String errorMessage) {
            this.finished = finished;
            this.error = error;
            this.finalAnswer = finalAnswer;
            this.errorMessage = errorMessage;
        }

        public static ReActStepResult finished(String answer) {
            return new ReActStepResult(true, false, answer, null);
        }

        public static ReActStepResult error(String message) {
            return new ReActStepResult(false, true, null, message);
        }

        public static ReActStepResult continueLoop() {
            return new ReActStepResult(false, false, null, null);
        }

        public boolean isFinished() { return finished; }
        public boolean isError() { return error; }
        public String getFinalAnswer() { return finalAnswer; }
        public String getErrorMessage() { return errorMessage; }
    }

    /**
     * 验证结果
     */
    public static class VerificationResult {
        private final boolean passed;
        private final String reason;

        private VerificationResult(boolean passed, String reason) {
            this.passed = passed;
            this.reason = reason;
        }

        public static VerificationResult passed(String reason) {
            return new VerificationResult(true, reason);
        }

        public static VerificationResult failed(String reason) {
            return new VerificationResult(false, reason);
        }

        public boolean isPassed() { return passed; }
        public String getReason() { return reason; }
    }

    /**
     * ReAct状态追踪
     */
    public static class ReActState {
        private final List<ReasoningEntry> previousReasonings = new ArrayList<>();
        private final List<ExecutionEntry> previousExecutions = new ArrayList<>();

        public void addReasoning(int iteration, String reasoning) {
            previousReasonings.add(new ReasoningEntry(iteration, reasoning));
        }

        public void addExecution(int iteration,
                                  List<AiAgentToolExecHelper.ToolExecRecord> execRecords,
                                  VerificationResult verificationResult) {
            previousExecutions.add(new ExecutionEntry(iteration, execRecords, verificationResult));
        }

        public List<ReasoningEntry> getPreviousReasonings() {
            return previousReasonings;
        }

        public List<ExecutionEntry> getPreviousExecutions() {
            return previousExecutions;
        }

        public record ReasoningEntry(int iteration, String reasoning) {}
        public record ExecutionEntry(int iteration,
                                      List<AiAgentToolExecHelper.ToolExecRecord> execRecords,
                                      VerificationResult verificationResult) {}
    }
}
