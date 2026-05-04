package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * Agent执行指标 —— 用于自我批评和性能分析。
 */
@Data
public class AgentExecutionMetrics {

    /** 执行耗时（毫秒） */
    private long durationMs;

    /** Token使用量 */
    private int tokenUsed;

    /** Agent迭代轮数 */
    private int iterations;

    /** 工具调用次数 */
    private int toolCallCount;

    /** 页面上下文 */
    private String pageContext;

    /** 历史对话轮数 */
    private int historyTurns;

    /** 是否触发了Stuck检测 */
    private boolean stuckDetected;

    /** Critic审查置信度 */
    private int criticConfidence;

    /** 使用的模型名称 */
    private String modelName;

    public static AgentExecutionMetrics empty() {
        return new AgentExecutionMetrics();
    }
}
