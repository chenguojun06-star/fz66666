package com.fashion.supplychain.intelligence.dto;

import java.util.List;
import lombok.Data;

/**
 * 工人效率画像响应 — 五维雷达 + 工序匹配度
 */
@Data
public class WorkerEfficiencyResponse {
    private List<WorkerEfficiency> workers;
    private String topWorkerName;
    private int totalEvaluated;

    @Data
    public static class WorkerEfficiency {
        private String workerId;
        private String workerName;
        /** 综合得分 0-100 */
        private int overallScore;
        /** 速度维度 0-100 */
        private int speedScore;
        /** 质量维度 0-100（质检通过率） */
        private int qualityScore;
        /** 稳定性维度 0-100（日均方差倒数） */
        private int stabilityScore;
        /** 出勤维度 0-100（月活跃天数占比） */
        private int attendanceScore;
        /** 多面手维度 0-100（掌握工序/总工序） */
        private int versatilityScore;
        /** 最擅长工序 */
        private String bestProcess;
        /** 日均产量 */
        private double dailyAvgOutput;
        /** 近7天趋势：up / down / flat */
        private String trend;
    }
}
