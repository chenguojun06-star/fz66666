package com.fashion.supplychain.intelligence.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

/**
 * AI 学习报告响应 DTO
 */
@Data
public class LearningReportResponse {
    /** 总样本数 */
    private long totalSamples;
    /** 统计工序数 */
    private int stageCount;
    /** 平均置信度（0-1） */
    private double avgConfidence;
    /** 预测准确率（偏差<30分钟的占比） */
    private double accuracyRate;
    /** 总反馈记录数 */
    private long feedbackCount;
    /** 最后学习时间 */
    private String lastLearnTime;
    /** 各工序学习状态 */
    private List<StageLearningStat> stages = new ArrayList<>();

    @Data
    public static class StageLearningStat {
        private String stageName;
        private int sampleCount;
        private double confidence;
        private double avgMinutesPerUnit;
    }
}
