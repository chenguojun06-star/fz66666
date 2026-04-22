package com.fashion.supplychain.intelligence.dto;

import java.time.LocalDateTime;
import java.util.List;
import lombok.Builder;
import lombok.Data;

/**
 * AI 准确率量化仪表板响应 DTO
 *
 * <p>汇总三大核心指标，用于商业演示与说服力量化：
 * <ul>
 *   <li>deliveryHitRate  — 交期预测命中率（±N天内）</li>
 *   <li>adoptionRate     — AI建议采纳率</li>
 *   <li>avgBiasDays      — 平均预测偏差天数（绝对值）</li>
 * </ul>
 */
@Data
@Builder
public class AiAccuracyDashboardResponse {

    // ── 交期预测命中率 ──────────────────────────────
    /** 命中率 0.0~1.0，命中 = |偏差| ≤ toleranceDays */
    private double deliveryHitRate;
    /** 实际被评估的预测总数（已有 actualFinishTime 的记录） */
    private int totalPredictions;
    /** 在容差范围内的命中数 */
    private int hitCount;
    /** 命中容差描述，如 "±2天" */
    private String hitToleranceDesc;
    /** 平均偏差天数（绝对值均值），正值=预测偏早，负值=预测偏晚 */
    private double avgBiasDays;

    // ── 建议采纳率 ──────────────────────────────────
    /** 采纳率 0.0~1.0 */
    private double adoptionRate;
    /** 参与采纳统计的样本数（有明确 accepted 反馈的调用次数） */
    private int totalAdoptionSamples;
    /** 统计的时间窗口描述，如 "最近90天" */
    private String periodDesc;

    // ── 场景细分 ────────────────────────────────────
    /** 各场景细分成功率，用于详情展开 */
    private List<SceneAccuracyItem> sceneBreakdown;

    /** 数据计算时间戳（前端展示"上次更新时间"） */
    private LocalDateTime computedAt;

    // ── 场景细分子 DTO ──────────────────────────────
    @Data
    @Builder
    public static class SceneAccuracyItem {
        private String scene;
        private int totalCalls;
        private int successCount;
        private double successRate;
        private double avgLatencyMs;
    }
}
