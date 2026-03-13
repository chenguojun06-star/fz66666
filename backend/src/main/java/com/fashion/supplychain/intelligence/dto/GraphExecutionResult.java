package com.fashion.supplychain.intelligence.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 多代理图执行结果 DTO — 前端消费
 */
@Data
public class GraphExecutionResult {

    /** 最终路由决策（由 SupervisorAgent 决定） */
    private String route;

    /** 综合置信度评分 0-100 */
    private int confidenceScore;

    /** ReflectionEngine 批判性反思内容（JSON 文本） */
    private String reflection;

    /** 核心优化建议（从 reflection 提炼，易读文本） */
    private String optimizationSuggestion;

    /** Supervisor 分析摘要 */
    private String contextSummary;

    /** 是否成功 */
    private boolean success;

    /** 错误信息（仅 success=false 时非空） */
    private String errorMessage;

    /** 执行完成时间 */
    private LocalDateTime executedAt;

    /** 端到端执行耗时（毫秒） */
    private long latencyMs;

    // ── v4.1 扩展字段 ─────────────────────────────────────────────────────

    /** 各 Specialist 输出（route → analysisText） */
    private Map<String, String> specialistResults;

    /** 节点执行轨迹（有序节点名列表） */
    private List<String> nodeTrace;

    /** 唯一执行ID */
    private String executionId;

    /** 数字孪生快照（JSON） */
    private String digitalTwinSnapshot;
}
