package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * ToolTraceService — 工具调用链路追踪服务（2026年可观测性最佳实践）
 *
 * <p>提供完整的工具调用可观测性：
 * 1. 全链路追踪
 * 2. 性能统计
 * 3. 调用关系图谱
 * 4. 失败根因分析
 * 5. 执行历史回放
 *
 * <p>这是诊断和优化 AI Agent 执行效率的关键组件。
 */
@Slf4j
@Service
public class ToolTraceService {

    // 会话追踪记录
    private final Map<String, SessionTrace> sessionTraces = new ConcurrentHashMap<>();

    // 最大保留追踪数
    private static final int MAX_TRACES = 1000;

    /**
     * 开始会话追踪
     */
    public void startSession(String sessionId, String userMessage) {
        SessionTrace trace = new SessionTrace(sessionId, userMessage);
        sessionTraces.put(sessionId, trace);
        cleanupOldTraces();
        log.info("[ToolTrace] 会话追踪开始: sessionId={}", sessionId);
    }

    /**
     * 记录工具调用开始
     */
    public void recordToolStart(String sessionId, AiToolCall toolCall) {
        SessionTrace trace = sessionTraces.get(sessionId);
        if (trace != null) {
            trace.addToolCall(toolCall);
        }
    }

    /**
     * 记录工具调用完成
     */
    public void recordToolComplete(String sessionId, String toolCallId,
                                    AiAgentToolExecHelper.ToolExecRecord record) {
        SessionTrace trace = sessionTraces.get(sessionId);
        if (trace != null) {
            trace.completeToolCall(toolCallId, record);
        }
    }

    /**
     * 记录推理步骤
     */
    public void recordReasoningStep(String sessionId, int iteration, String reasoning) {
        SessionTrace trace = sessionTraces.get(sessionId);
        if (trace != null) {
            trace.addReasoningStep(iteration, reasoning);
        }
    }

    /**
     * 结束会话追踪
     */
    public void endSession(String sessionId, String finalAnswer) {
        SessionTrace trace = sessionTraces.get(sessionId);
        if (trace != null) {
            trace.end(finalAnswer);
            log.info("[ToolTrace] 会话追踪结束: sessionId={}, duration={}ms, toolCalls={}",
                    sessionId, trace.getDurationMs(), trace.getToolCallCount());
        }
    }

    /**
     * 获取会话追踪
     */
    public SessionTrace getSessionTrace(String sessionId) {
        return sessionTraces.get(sessionId);
    }

    /**
     * 获取所有活跃追踪
     */
    public List<SessionTrace> getAllTraces() {
        return new ArrayList<>(sessionTraces.values());
    }

    /**
     * 获取性能统计
     */
    public Map<String, Object> getPerformanceStats() {
        Map<String, Object> stats = new HashMap<>();

        int totalToolCalls = 0;
        int failedToolCalls = 0;
        long totalLatency = 0;
        Map<String, ToolStatsPerTool> toolStats = new HashMap<>();

        for (SessionTrace trace : sessionTraces.values()) {
            for (ToolCallTrace toolTrace : trace.getToolCalls()) {
                totalToolCalls++;
                if (!toolTrace.isSuccess()) {
                    failedToolCalls++;
                }
                if (toolTrace.getLatencyMs() > 0) {
                    totalLatency += toolTrace.getLatencyMs();
                }

                ToolStatsPerTool toolStat = toolStats.computeIfAbsent(
                        toolTrace.getToolName(), k -> new ToolStatsPerTool(toolTrace.getToolName()));
                toolStat.recordCall(toolTrace.isSuccess(), toolTrace.getLatencyMs());
            }
        }

        stats.put("totalToolCalls", totalToolCalls);
        stats.put("failedToolCalls", failedToolCalls);
        stats.put("successRate", totalToolCalls > 0 ?
                (double) (totalToolCalls - failedToolCalls) / totalToolCalls : 1.0);
        stats.put("avgLatencyMs", totalToolCalls > 0 ? totalLatency / totalToolCalls : 0);
        stats.put("toolStats", new ArrayList<>(toolStats.values()));
        stats.put("activeSessions", sessionTraces.size());

        return stats;
    }

    /**
     * 清理旧追踪
     */
    private void cleanupOldTraces() {
        if (sessionTraces.size() > MAX_TRACES) {
            List<String> sortedKeys = new ArrayList<>(sessionTraces.keySet());
            sortedKeys.sort(Comparator.comparing(k -> sessionTraces.get(k).getStartTime()));
            int toRemove = sessionTraces.size() - MAX_TRACES;
            for (int i = 0; i < toRemove; i++) {
                sessionTraces.remove(sortedKeys.get(i));
            }
        }
    }

    // ===== 内部类 =====

    /**
     * 会话追踪
     */
    public static class SessionTrace {
        private final String sessionId;
        private final String userMessage;
        private final Instant startTime;
        private Instant endTime;
        private String finalAnswer;
        private final List<ReasoningStep> reasoningSteps = new ArrayList<>();
        private final List<ToolCallTrace> toolCalls = new ArrayList<>();

        public SessionTrace(String sessionId, String userMessage) {
            this.sessionId = sessionId;
            this.userMessage = userMessage;
            this.startTime = Instant.now();
        }

        public void addReasoningStep(int iteration, String reasoning) {
            reasoningSteps.add(new ReasoningStep(iteration, reasoning, Instant.now()));
        }

        public void addToolCall(AiToolCall toolCall) {
            toolCalls.add(new ToolCallTrace(toolCall));
        }

        public void completeToolCall(String toolCallId,
                                      AiAgentToolExecHelper.ToolExecRecord record) {
            for (ToolCallTrace trace : toolCalls) {
                if (trace.getToolCallId().equals(toolCallId)) {
                    trace.complete(record);
                    break;
                }
            }
        }

        public void end(String finalAnswer) {
            this.endTime = Instant.now();
            this.finalAnswer = finalAnswer;
        }

        public String getSessionId() { return sessionId; }
        public String getUserMessage() { return userMessage; }
        public Instant getStartTime() { return startTime; }
        public Instant getEndTime() { return endTime; }
        public String getFinalAnswer() { return finalAnswer; }
        public List<ReasoningStep> getReasoningSteps() {
            return Collections.unmodifiableList(reasoningSteps);
        }
        public List<ToolCallTrace> getToolCalls() {
            return Collections.unmodifiableList(toolCalls);
        }

        public long getDurationMs() {
            if (endTime != null) {
                return endTime.toEpochMilli() - startTime.toEpochMilli();
            }
            return Instant.now().toEpochMilli() - startTime.toEpochMilli();
        }

        public int getToolCallCount() {
            return toolCalls.size();
        }
    }

    /**
     * 推理步骤
     */
    public static class ReasoningStep {
        private final int iteration;
        private final String reasoning;
        private final Instant timestamp;

        public ReasoningStep(int iteration, String reasoning, Instant timestamp) {
            this.iteration = iteration;
            this.reasoning = reasoning;
            this.timestamp = timestamp;
        }

        public int getIteration() { return iteration; }
        public String getReasoning() { return reasoning; }
        public Instant getTimestamp() { return timestamp; }
    }

    /**
     * 工具调用追踪
     */
    public static class ToolCallTrace {
        private final String toolCallId;
        private final String toolName;
        private final String arguments;
        private final Instant startTime;
        private Instant endTime;
        private boolean success;
        private String result;
        private String errorMessage;

        public ToolCallTrace(AiToolCall toolCall) {
            this.toolCallId = toolCall.getId();
            this.toolName = toolCall.getFunction().getName();
            this.arguments = toolCall.getFunction().getArguments();
            this.startTime = Instant.now();
        }

        public void complete(AiAgentToolExecHelper.ToolExecRecord record) {
            this.endTime = Instant.now();
            this.success = record.rawResult != null &&
                    !record.rawResult.startsWith("{\"error\"");
            this.result = record.evidence;
            if (!this.success) {
                this.errorMessage = record.evidence;
            }
        }

        public String getToolCallId() { return toolCallId; }
        public String getToolName() { return toolName; }
        public String getArguments() { return arguments; }
        public Instant getStartTime() { return startTime; }
        public Instant getEndTime() { return endTime; }
        public boolean isSuccess() { return success; }
        public String getResult() { return result; }
        public String getErrorMessage() { return errorMessage; }

        public long getLatencyMs() {
            if (endTime != null) {
                return endTime.toEpochMilli() - startTime.toEpochMilli();
            }
            return 0;
        }
    }

    /**
     * 工具级别统计
     */
    public static class ToolStatsPerTool {
        private final String toolName;
        private int totalCalls = 0;
        private int successCalls = 0;
        private long totalLatencyMs = 0;

        public ToolStatsPerTool(String toolName) {
            this.toolName = toolName;
        }

        public void recordCall(boolean success, long latencyMs) {
            totalCalls++;
            if (success) successCalls++;
            totalLatencyMs += latencyMs;
        }

        public String getToolName() { return toolName; }
        public int getTotalCalls() { return totalCalls; }
        public int getSuccessCalls() { return successCalls; }
        public double getSuccessRate() {
            return totalCalls > 0 ? (double) successCalls / totalCalls : 1.0;
        }
        public long getAvgLatencyMs() {
            return totalCalls > 0 ? totalLatencyMs / totalCalls : 0;
        }
    }
}
