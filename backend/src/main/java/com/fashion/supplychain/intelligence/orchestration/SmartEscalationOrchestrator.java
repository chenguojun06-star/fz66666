package com.fashion.supplychain.intelligence.orchestration;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicIntegerArray;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 智能升级编排器 — 支持从历史数据中学习升级策略
 *
 * <p>职责：根据风险等级、停滞时长、异常级别统一给出升级级别与时效建议。</p>
 *
 * <p><b>学习机制：</b>
 * 每次标记已执行/关闭时，调用 {@link #recordOutcome} 记录处理耗时。
 * 当某级别历史平均处理耗时持续降低时，后续同类场景可动态降级（L3→L2），
 * 反之持续升高时动态升级（L1→L2）。</p>
 */
@Slf4j
@Service
public class SmartEscalationOrchestrator {

    private static final int MIN_HISTORY_SAMPLES = 5;
    private static final long L3_SLOW_THRESHOLD_MINUTES = 480;
    private static final long L2_SLOW_THRESHOLD_MINUTES = 240;
    private static final long L1_SLOW_THRESHOLD_MINUTES = 120;

    private static final long L3_FAST_THRESHOLD_MINUTES = 120;
    private static final long L2_FAST_THRESHOLD_MINUTES = 60;
    private static final long L1_FAST_THRESHOLD_MINUTES = 30;

    /**
     * 升级级别效果统计：[总次数, 总处理分钟, 样本数]
     * key = level (L1/L2/L3)
     */
    private final ConcurrentHashMap<String, java.util.concurrent.atomic.AtomicIntegerArray> levelStats
        = new ConcurrentHashMap<>();

    // ── 静态映射（基线）──────────────────────────────────────────────

    public String escalationByRisk(String riskLevel) {
        if (riskLevel == null) return "L1";
        String value = riskLevel.trim().toLowerCase();
        String baseLevel;
        if ("overdue".equals(value) || "danger".equals(value) || "high".equals(value) || "critical".equals(value)) {
            baseLevel = "L3";
        } else if ("warning".equals(value) || "medium".equals(value)) {
            baseLevel = "L2";
        } else {
            baseLevel = "L1";
        }
        return applyLearning(baseLevel);
    }

    public String escalationBySilentMinutes(long minutesSilent) {
        String baseLevel;
        if (minutesSilent >= 240) {
            baseLevel = "L3";
        } else if (minutesSilent >= 60) {
            baseLevel = "L2";
        } else {
            baseLevel = "L1";
        }
        return applyLearning(baseLevel);
    }

    public String dueHintByEscalation(String escalationLevel) {
        if ("L3".equalsIgnoreCase(escalationLevel)) return "2小时内处理";
        if ("L2".equalsIgnoreCase(escalationLevel)) return "今日处理";
        return "本周处理";
    }

    // ── 学习 API ─────────────────────────────────────────────────────

    /**
     * 记录一次升级结果。
     *
     * @param level           使用的升级级别（L1/L2/L3）
     * @param resolutionMins  从创建到关闭/执行的分钟数
     */
    public void recordOutcome(String level, long resolutionMins) {
        if (level == null || level.isBlank()) return;
        String key = level.toUpperCase();
        java.util.concurrent.atomic.AtomicIntegerArray stats = levelStats.computeIfAbsent(
            key, k -> new java.util.concurrent.atomic.AtomicIntegerArray(3));
        stats.incrementAndGet(0);           // 总次数
        stats.addAndGet(1, (int) Math.min(resolutionMins, Integer.MAX_VALUE)); // 累计分钟
        stats.incrementAndGet(2);           // 样本数
        log.debug("[SmartEscalation] 记录 {} 级升级结果: {} 分钟", key, resolutionMins);
    }

    /**
     * 应用学习调整：根据历史处理效率对基线级别进行±1级调整。
     *
     * <p>规则：
     * <ul>
     *   <li>L3 历史平均处理 < 2h（120分钟）且样本≥5 → 降为 L2</li>
     *   <li>L1 历史平均处理 > 2h（120分钟）且样本≥5 → 升为 L2</li>
     *   <li>L2 历史平均处理 < 1h（60分钟）且样本≥5 → 降为 L1</li>
     *   <li>L2 历史平均处理 > 4h（240分钟）且样本≥5 → 升为 L3</li>
     * </ul>
     */
    private String applyLearning(String baseLevel) {
        if (baseLevel == null) return "L1";

        if ("L3".equals(baseLevel)) {
            double avgMins = getAvgResolutionMins("L3");
            if (avgMins > 0 && avgMins < L3_FAST_THRESHOLD_MINUTES) {
                log.debug("[SmartEscalation] L3历史平均{}分钟 < {}分钟，降级为L2",
                    (int) avgMins, L3_FAST_THRESHOLD_MINUTES);
                return "L2";
            }
            return "L3";
        }

        if ("L1".equals(baseLevel)) {
            double avgMins = getAvgResolutionMins("L1");
            if (avgMins > L1_SLOW_THRESHOLD_MINUTES) {
                log.debug("[SmartEscalation] L1历史平均{}分钟 > {}分钟，升级为L2",
                    (int) avgMins, L1_SLOW_THRESHOLD_MINUTES);
                return "L2";
            }
            return "L1";
        }

        if ("L2".equals(baseLevel)) {
            double avgMins = getAvgResolutionMins("L2");
            if (avgMins > 0 && avgMins < L2_FAST_THRESHOLD_MINUTES) {
                log.debug("[SmartEscalation] L2历史平均{}分钟 < {}分钟，降级为L1",
                    (int) avgMins, L2_FAST_THRESHOLD_MINUTES);
                return "L1";
            }
            if (avgMins > L2_SLOW_THRESHOLD_MINUTES) {
                log.debug("[SmartEscalation] L2历史平均{}分钟 > {}分钟，升级为L3",
                    (int) avgMins, L2_SLOW_THRESHOLD_MINUTES);
                return "L3";
            }
            return "L2";
        }

        return "L1";
    }

    /**
     * 获取某级别历史平均处理时间（分钟）。
     * 样本不足时返回 -1。
     */
    private double getAvgResolutionMins(String level) {
        java.util.concurrent.atomic.AtomicIntegerArray s = levelStats.get(level);
        if (s == null || s.get(2) < MIN_HISTORY_SAMPLES) return -1;
        return (double) s.get(1) / s.get(2);
    }
}