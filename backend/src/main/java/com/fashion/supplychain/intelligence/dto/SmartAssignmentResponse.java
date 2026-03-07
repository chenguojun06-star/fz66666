package com.fashion.supplychain.intelligence.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

/**
 * 智能派工推荐响应 DTO
 */
@Data
public class SmartAssignmentResponse {
    private String stageName;
    private List<WorkerRecommendation> recommendations = new ArrayList<>();
    /** AI对本次派工结果的综合分析（需AI服务已启用） */
    private String aiSuggestion;

    @Data
    public static class WorkerRecommendation {
        /** 工人名称 */
        private String operatorName;
        /** 推荐评分 0-100 */
        private int score;
        /** 推荐理由 */
        private String reason;
        /** 该工序日均完成件数 */
        private double avgPerDay;
        /** 对比工厂均值百分比 */
        private int vsAvgPct;
        /** 评级：excellent / good / normal */
        private String level;
        /** 最近活跃日期 */
        private String lastActiveDate;
    }
}
