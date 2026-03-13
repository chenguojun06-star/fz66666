package com.fashion.supplychain.intelligence.dto;

import lombok.Data;
import java.util.List;

/** Stage6 What-If推演沙盘响应 */
@Data
public class WhatIfResponse {

    /** 推演摘要（AI自然语言描述最优策略） */
    private String summary;

    /** 基准快照（现状） */
    private ScenarioResult baseline;

    /** 每个推演场景的对比结果 */
    private List<ScenarioResult> scenarios;

    /** 最优场景标识（recommendation） */
    private String recommendedScenario;

    @Data
    public static class ScenarioResult {
        /** 场景标识：baseline / ADVANCE_DELIVERY_3d / ADD_WORKERS_5人 等 */
        private String scenarioKey;

        /** 场景描述 */
        private String description;

        /** 预计完工日期变化（天数，负=提前，正=推迟） */
        private Integer finishDateDeltaDays;

        /** 预计成本变化（元，负=降低，正=增加） */
        private Double costDelta;

        /** 逾期风险变化（百分比点，负=好转，正=恶化） */
        private Double overdueRiskDelta;

        /** 综合评分 0-100（越高越好） */
        private Integer score;

        /** 操作建议 */
        private String action;
    }
}
