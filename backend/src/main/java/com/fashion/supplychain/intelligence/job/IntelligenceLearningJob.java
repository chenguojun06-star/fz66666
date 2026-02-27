package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 智能编排每日学习任务
 *
 * <p>每天凌晨 02:30 自动触发，对所有活跃租户重新聚合过去 90 天的扫码数据，
 * 更新工序耗时统计（t_intelligence_process_stats），实现"越用越准"的效果。
 *
 * <p><b>为什么是 02:30？</b>避开生产高峰（白班/晚班），减少对数据库的竞争压力。
 *
 * <p><b>失败策略：</b>单个租户计算失败不影响其他租户，全部完成后输出汇总日志
 * （success_count / failed_count），便于监控告警识别异常租户。
 */
@Component
@Slf4j
public class IntelligenceLearningJob {

    @Autowired
    private ProcessStatsEngine processStatsEngine;

    /**
     * 每日 02:30 学习任务入口（cron: 秒 分 时 日 月 星期）
     */
    @Scheduled(cron = "0 30 2 * * ?")
    public void dailyRecompute() {
        log.info("[智能学习Job] ===== 每日工序统计学习开始 =====");

        List<Long> tenants = processStatsEngine.findActiveTenantIds();
        if (tenants == null || tenants.isEmpty()) {
            log.info("[智能学习Job] 暂无活跃租户，跳过本次学习");
            return;
        }

        log.info("[智能学习Job] 发现 {} 个活跃租户，开始逐一计算...", tenants.size());

        int totalUpdated = 0;
        int successCount = 0;
        int failedCount = 0;

        for (Long tenantId : tenants) {
            try {
                int updated = processStatsEngine.recomputeForTenant(tenantId);
                totalUpdated += updated;
                successCount++;
            } catch (Exception e) {
                failedCount++;
                log.warn("[智能学习Job] 租户 {} 计算失败: {}", tenantId, e.getMessage());
            }
        }

        if (failedCount > 0) {
            log.warn("[智能学习Job] ===== 学习完成（有失败） "
                    + "成功={} 失败={} 总更新条目={} =====",
                    successCount, failedCount, totalUpdated);
        } else {
            log.info("[智能学习Job] ===== 学习完成 "
                    + "成功={} 总更新条目={} =====",
                    successCount, totalUpdated);
        }
    }
}
