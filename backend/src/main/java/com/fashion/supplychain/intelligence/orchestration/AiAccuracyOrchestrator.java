package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.AiAccuracyDashboardResponse;
import com.fashion.supplychain.intelligence.dto.AiAccuracyDashboardResponse.SceneAccuracyItem;
import com.fashion.supplychain.intelligence.mapper.IntelligenceMetricsMapper;
import com.fashion.supplychain.intelligence.mapper.IntelligencePredictionLogMapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * AI 准确率量化编排器
 *
 * <p>职责：聚合 t_intelligence_prediction_log 与 t_intelligence_metrics 中的历史数据，
 * 计算三大可对外展示的准确率指标：
 * <ol>
 *   <li>交期预测命中率 —— 偏差 ≤ toleranceDays 的占比</li>
 *   <li>建议采纳率     —— accepted=1 的占比（有反馈的调用）</li>
 *   <li>平均偏差天数   —— |deviation_minutes| 绝对均值</li>
 * </ol>
 *
 * <p>不依赖 IntelligenceController，通过独立 AiAccuracyController 对外暴露。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiAccuracyOrchestrator {

    private final IntelligencePredictionLogMapper predictionLogMapper;
    private final IntelligenceMetricsMapper metricsMapper;

    /**
     * 计算 AI 准确率仪表板数据。
     *
     * @param tenantId      租户 ID
     * @param toleranceDays 交期命中容差（天），默认建议 2
     * @param recentDays    采纳率统计的时间窗口（天），默认 90
     * @return 完整的准确率 DTO
     */
    public AiAccuracyDashboardResponse computeDashboard(Long tenantId, int toleranceDays, int recentDays) {

        // ── 1. 交期预测命中率 ──────────────────────────────────────
        int totalPredictions = predictionLogMapper.countEvaluated(tenantId);
        long toleranceMinutes = (long) toleranceDays * 24 * 60;
        int hitCount = totalPredictions > 0 ? predictionLogMapper.countHits(tenantId, toleranceMinutes) : 0;
        double deliveryHitRate = totalPredictions > 0 ? (double) hitCount / totalPredictions : 0.0;

        Double avgBiasRaw = predictionLogMapper.getAvgAbsBiasDays(tenantId);
        double avgBiasDays = avgBiasRaw != null ? avgBiasRaw : 0.0;

        // ── 2. 建议采纳率 ──────────────────────────────────────────
        Map<String, Object> adoptionStats = metricsMapper.getAdoptionStats(tenantId, recentDays);
        int totalAdoptionSamples = 0;
        double adoptionRate = 0.0;
        if (adoptionStats != null) {
            Object totalObj   = adoptionStats.get("total");
            Object adoptedObj = adoptionStats.get("adopted");
            totalAdoptionSamples = totalObj   != null ? ((Number) totalObj).intValue()   : 0;
            int adoptedCount     = adoptedObj != null ? ((Number) adoptedObj).intValue() : 0;
            adoptionRate = totalAdoptionSamples > 0
                    ? (double) adoptedCount / totalAdoptionSamples
                    : 0.0;
        }

        // ── 3. 场景细分成功率 ──────────────────────────────────────
        List<Map<String, Object>> sceneMaps = metricsMapper.aggregateByScene(tenantId, recentDays);
        List<SceneAccuracyItem> sceneBreakdown = new ArrayList<>();
        for (Map<String, Object> row : sceneMaps) {
            Object totalCallsObj   = row.get("total_calls");
            Object successCountObj = row.get("success_count");
            Object avgLatencyObj   = row.get("avg_latency_ms");
            int totalCalls   = totalCallsObj   != null ? ((Number) totalCallsObj).intValue()   : 0;
            int successCount = successCountObj != null ? ((Number) successCountObj).intValue() : 0;
            double avgLatency = avgLatencyObj  != null ? ((Number) avgLatencyObj).doubleValue() : 0.0;
            double sceneRate  = totalCalls > 0 ? (double) successCount / totalCalls : 0.0;
            sceneBreakdown.add(SceneAccuracyItem.builder()
                    .scene(String.valueOf(row.get("scene")))
                    .totalCalls(totalCalls)
                    .successCount(successCount)
                    .successRate(sceneRate)
                    .avgLatencyMs(avgLatency)
                    .build());
        }

        return AiAccuracyDashboardResponse.builder()
                .deliveryHitRate(deliveryHitRate)
                .totalPredictions(totalPredictions)
                .hitCount(hitCount)
                .hitToleranceDesc("±" + toleranceDays + "天")
                .avgBiasDays(avgBiasDays)
                .adoptionRate(adoptionRate)
                .totalAdoptionSamples(totalAdoptionSamples)
                .periodDesc("最近" + recentDays + "天")
                .sceneBreakdown(sceneBreakdown)
                .computedAt(LocalDateTime.now())
                .build();
    }
}
