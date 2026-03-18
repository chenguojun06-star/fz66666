package com.fashion.supplychain.intelligence.dto;

import java.util.List;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 超级顾问响应 DTO — 结构化输出，前端可直接渲染图表和风险指标。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HyperAdvisorResponse {

    /** AI 分析结论文本 */
    private String analysis;

    /** 是否需要追问（true 时 analysis 是追问内容，前端显示追问卡片） */
    private boolean needsClarification;

    /** 风险量化指标列表（前端渲染小仪表盘用） */
    private List<RiskIndicator> riskIndicators;

    /** 数字孪生模拟结果（前端渲染对比表格/图表） */
    private SimulationResult simulation;

    /** 个性化画像标签（当前用户角色适配） */
    private String profileHint;

    /** 本轮 traceId（用于反馈关联） */
    private String traceId;

    /** 会话ID（前端持久化） */
    private String sessionId;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RiskIndicator {
        private String name;
        private double probability;
        private String level;
        private String description;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SimulationResult {
        private String scenarioDescription;
        private List<Map<String, Object>> scenarioRows;
        private String recommendation;
    }
}
