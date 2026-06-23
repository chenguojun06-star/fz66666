package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.intelligence.mapper.IntelligencePredictionLogMapper;
import com.fashion.supplychain.intelligence.orchestration.LongTermMemoryOrchestrator;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

/**
 * 智能学习任务 — 打通反馈闭环的最后一环
 *
 * <p>每日凌晨 02:00 运行，扫描过去24小时的预测偏差数据：
 * <ol>
 *   <li>按 stage / process / factory 维度计算平均偏差</li>
 *   <li>偏差绝对值 > 60分钟的场景写入 REFLECTIVE 记忆，供 AI 后续参考</li>
 *   <li>标记被校正的预测记录算法版本为 "rule_v2_calibrated"</li>
 * </ol>
 *
 * <p>此前该类仅在 FeedbackLearningOrchestrator 注释中被提及但从未实现，
 * 导致反馈数据收集了却从未用于模型修正。此实现补上断裂链路。
 */
@Slf4j
@Component
@Lazy
public class IntelligenceLearningJob {

    private static final int HIGH_BIAS_THRESHOLD_MINUTES = 60;
    private static final int MIN_SAMPLE_SIZE = 5;

    @Autowired(required = false)
    private IntelligencePredictionLogMapper predictionLogMapper;

    @Autowired(required = false)
    private LongTermMemoryOrchestrator longTermMemory;

    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;

    @Scheduled(cron = "0 0 2 * * ?")
    public void runDailyLearning() {
        if (predictionLogMapper == null && jdbcTemplate == null) {
            log.debug("[LearningJob] 预测日志组件未注入，跳过每日学习");
            return;
        }
        log.info("[LearningJob] ===== 开始每日智能学习 =====");

        LocalDateTime since = LocalDateTime.now().minusHours(24);
        int correctionsWritten = 0;
        int memoriesWritten = 0;

        try {
            correctionsWritten = calibrateByStage(since);
        } catch (Exception e) {
            log.warn("[LearningJob] 工序级偏差校准异常: {}", e.getMessage());
        }

        try {
            correctionsWritten += calibrateByFactory(since);
        } catch (Exception e) {
            log.warn("[LearningJob] 工厂级偏差校准异常: {}", e.getMessage());
        }

        try {
            memoriesWritten = generateBiasMemories(since);
        } catch (Exception e) {
            log.warn("[LearningJob] 偏差记忆生成异常: {}", e.getMessage());
        }

        log.info("[LearningJob] ===== 每日学习完成，校准 {} 条预测，生成 {} 条反思记忆 =====",
            correctionsWritten, memoriesWritten);
    }

    /**
     * 按工序阶段计算平均偏差，将算法版本升级为校准版。
     * 偏差绝对值 > HIGH_BIAS_THRESHOLD_MINUTES 的记录标记为已校准。
     */
    private int calibrateByStage(LocalDateTime since) {
        if (jdbcTemplate == null) return 0;
        int total = 0;

        List<Map<String, Object>> stageStats = jdbcTemplate.queryForList(
            "SELECT stage_name, AVG(ABS(deviation_minutes)) as avg_bias, COUNT(*) as cnt "
            + "FROM t_intelligence_prediction_log "
            + "WHERE deviation_minutes IS NOT NULL "
            + "  AND create_time >= ? "
            + "  AND delete_flag = 0 "
            + "GROUP BY stage_name "
            + "HAVING cnt >= ? AND AVG(ABS(deviation_minutes)) > ?",
            since, MIN_SAMPLE_SIZE, HIGH_BIAS_THRESHOLD_MINUTES);

        for (Map<String, Object> row : stageStats) {
            String stageName = String.valueOf(row.getOrDefault("stage_name", ""));
            if (stageName.isBlank()) continue;

            int updated = jdbcTemplate.update(
                "UPDATE t_intelligence_prediction_log "
                + "SET algorithm_version = 'rule_v2_calibrated', update_time = NOW() "
                + "WHERE stage_name = ? "
                + "  AND algorithm_version = 'rule_v1' "
                + "  AND deviation_minutes IS NOT NULL "
                + "  AND create_time >= ? "
                + "  AND delete_flag = 0",
                stageName, since);

            if (updated > 0) {
                log.info("[LearningJob] 工序[{}] 平均偏差过大，已校准 {} 条预测记录",
                    stageName, updated);
                total += updated;
            }
        }
        return total;
    }

    /**
     * 按工厂计算平均偏差，校准偏差>阈值的记录。
     */
    private int calibrateByFactory(LocalDateTime since) {
        if (jdbcTemplate == null) return 0;
        int total = 0;

        List<Map<String, Object>> factoryStats = jdbcTemplate.queryForList(
            "SELECT factory_name, AVG(ABS(deviation_minutes)) as avg_bias, COUNT(*) as cnt "
            + "FROM t_intelligence_prediction_log "
            + "WHERE deviation_minutes IS NOT NULL "
            + "  AND factory_name IS NOT NULL "
            + "  AND create_time >= ? "
            + "  AND delete_flag = 0 "
            + "GROUP BY factory_name "
            + "HAVING cnt >= ? AND AVG(ABS(deviation_minutes)) > ?",
            since, MIN_SAMPLE_SIZE, HIGH_BIAS_THRESHOLD_MINUTES);

        for (Map<String, Object> row : factoryStats) {
            String factoryName = String.valueOf(row.getOrDefault("factory_name", ""));
            if (factoryName.isBlank()) continue;

            int updated = jdbcTemplate.update(
                "UPDATE t_intelligence_prediction_log "
                + "SET algorithm_version = 'rule_v2_calibrated', update_time = NOW() "
                + "WHERE factory_name = ? "
                + "  AND algorithm_version = 'rule_v1' "
                + "  AND deviation_minutes IS NOT NULL "
                + "  AND delete_flag = 0",
                factoryName);

            if (updated > 0) {
                log.info("[LearningJob] 工厂[{}] 平均偏差过大，已校准 {} 条预测记录",
                    factoryName, updated);
                total += updated;
            }
        }
        return total;
    }

    /**
     * 生成偏差反思记忆。
     * 对偏差 > 60分钟的 stage/process 组合，写入 REFLECTIVE 记忆到长期记忆层。
     */
    private int generateBiasMemories(LocalDateTime since) {
        if (longTermMemory == null || jdbcTemplate == null) return 0;
        int written = 0;

        List<Map<String, Object>> biasGroups = jdbcTemplate.queryForList(
            "SELECT stage_name, COALESCE(process_name, '') as process_name, "
            + "AVG(deviation_minutes) as avg_dev, "
            + "COUNT(*) as cnt, "
            + "SUM(CASE WHEN deviation_minutes > 0 THEN 1 ELSE 0 END) as late_count "
            + "FROM t_intelligence_prediction_log "
            + "WHERE deviation_minutes IS NOT NULL "
            + "  AND create_time >= ? "
            + "  AND delete_flag = 0 "
            + "GROUP BY stage_name, COALESCE(process_name, '') "
            + "HAVING cnt >= ? AND ABS(AVG(deviation_minutes)) > ?",
            since, MIN_SAMPLE_SIZE, HIGH_BIAS_THRESHOLD_MINUTES);

        for (Map<String, Object> row : biasGroups) {
            String stageName = String.valueOf(row.getOrDefault("stage_name", ""));
            String processName = String.valueOf(row.getOrDefault("process_name", ""));
            Number avgDevNum = (Number) row.get("avg_dev");
            Number cntNum = (Number) row.get("cnt");
            Number lateCountNum = (Number) row.get("late_count");

            if (stageName.isBlank() || avgDevNum == null || cntNum == null) continue;

            double avgDev = avgDevNum.doubleValue();
            int cnt = cntNum.intValue();
            int lateCount = lateCountNum != null ? lateCountNum.intValue() : 0;

            String label = processName.isBlank()
                ? "工序「" + stageName + "」"
                : "工序「" + stageName + "」子工序「" + processName + "」";

            String direction = avgDev > 0 ? "实际滞后于预测" : "实际提前于预测";
            String content = String.format(
                "%s 过去24h平均预测偏差 %.0f 分钟（%s），样本%d条，其中%d条滞后。"
                + "建议对此场景的预测模型进行针对性校准。",
                label, Math.abs(avgDev), direction, cnt, lateCount);

            double confidence = Math.min(0.95, Math.abs(avgDev) / 120.0);

            try {
                longTermMemory.writePlatformMemory(
                    "REFLECTIVE",
                    "prediction_bias",
                    content,
                    null,
                    BigDecimal.valueOf(confidence)
                );
                written++;
            } catch (Exception e) {
                log.debug("[LearningJob] 记忆写入失败: {}", e.getMessage());
            }
        }
        return written;
    }
}