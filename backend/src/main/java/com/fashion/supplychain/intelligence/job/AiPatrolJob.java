package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.intelligence.orchestration.DecisionCardOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.PatrolClosedLoopOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ProcessRewardOrchestrator;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * AI 闭环质量巡检定时任务
 * <p>每日凌晨 02:00 全量扫描：
 * <ol>
 *   <li>工具失败率 &gt; 50% → 创建 TOOL_FAILURE_RATE 巡检工单</li>
 *   <li>决策卡采纳率 &lt; 20% → 创建 LOW_ADOPTION_RATE 巡检工单</li>
 * </ol>
 * 生成的 AiPatrolAction 状态=PENDING，等待平台超管审批或自动修复。
 * </p>
 */
@Slf4j
@Component
public class AiPatrolJob {

    /** 工具失败率阈值：超过此值视为异常 */
    private static final double TOOL_FAILURE_THRESHOLD = 0.5;
    /** 决策卡采纳率阈值：低于此值视为低效 */
    private static final double ADOPTION_RATE_THRESHOLD = 0.2;

    @Autowired
    private ProcessRewardOrchestrator processRewardOrchestrator;
    @Autowired
    private DecisionCardOrchestrator decisionCardOrchestrator;
    @Autowired
    private PatrolClosedLoopOrchestrator patrolOrchestrator;

    /**
     * 每日 02:00 执行全量巡检
     */
    @Scheduled(cron = "0 0 2 * * ?")
    public void runDailyPatrol() {
        log.info("[AiPatrolJob] ===== 开始 AI 闭环质量巡检 =====");
        LocalDateTime since = LocalDateTime.now().minusHours(24);
        int issuesFound = 0;

        // ── 1. 工具失败率检测 ──
        try {
            List<Map<String, Object>> toolStats = processRewardOrchestrator.aggregateToolPerformance(since);
            for (Map<String, Object> row : toolStats) {
                String toolName = getString(row, "tool_name");
                Number totalNum = (Number) row.getOrDefault("total", 0);
                Number positiveNum = (Number) row.getOrDefault("positive", 0);
                if (totalNum == null || totalNum.intValue() < 5) continue; // 样本太小，跳过
                int total = totalNum.intValue();
                int failed = total - positiveNum.intValue();
                double failRate = (double) failed / total;
                if (failRate > TOOL_FAILURE_THRESHOLD) {
                    String issue = String.format("工具[%s] 过去24h失败率=%.0f%%（共%d次，失败%d次）",
                        toolName, failRate * 100, total, failed);
                    patrolOrchestrator.createAction(
                        "PATROL_JOB",
                        issue,
                        "TOOL_FAILURE_RATE",
                        failRate > 0.8 ? "HIGH" : "MEDIUM",
                        "tool",
                        toolName,
                        "{\"action\":\"review_tool_implementation\",\"toolName\":\"" + toolName + "\"}",
                        BigDecimal.valueOf(1.0 - failRate),
                        "NEED_APPROVAL"
                    );
                    log.warn("[AiPatrolJob] 工具失败率异常: {}", issue);
                    issuesFound++;
                }
            }
        } catch (Exception e) {
            log.warn("[AiPatrolJob] 工具失败率检测异常: {}", e.getMessage());
        }

        // ── 2. 决策卡采纳率检测 ──
        try {
            List<Map<String, Object>> adoptionStats = decisionCardOrchestrator.aggregateAdoption(since);
            for (Map<String, Object> row : adoptionStats) {
                String scene = getString(row, "scene");
                Number totalNum = (Number) row.getOrDefault("total", 0);
                Number adoptedNum = (Number) row.getOrDefault("adopted_count", 0);
                if (totalNum == null || totalNum.intValue() < 3) continue;
                double adoptionRate = adoptedNum.doubleValue() / totalNum.doubleValue();
                if (adoptionRate < ADOPTION_RATE_THRESHOLD) {
                    String issue = String.format("场景[%s] 过去24h决策卡采纳率=%.0f%%（共%d张，采纳%d张）",
                        scene, adoptionRate * 100, totalNum.intValue(), adoptedNum.intValue());
                    patrolOrchestrator.createAction(
                        "PATROL_JOB",
                        issue,
                        "LOW_ADOPTION_RATE",
                        "LOW",
                        "scene",
                        scene,
                        "{\"action\":\"review_recommendation_quality\",\"scene\":\"" + scene + "\"}",
                        BigDecimal.valueOf(adoptionRate + 0.1),
                        "AUTO_EXECUTE"
                    );
                    log.info("[AiPatrolJob] 决策卡采纳率偏低: {}", issue);
                    issuesFound++;
                }
            }
        } catch (Exception e) {
            log.warn("[AiPatrolJob] 决策卡采纳率检测异常: {}", e.getMessage());
        }

        log.info("[AiPatrolJob] ===== 巡检完成，发现 {} 个问题 =====", issuesFound);
    }

    private static String getString(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v == null ? "unknown" : v.toString();
    }
}
