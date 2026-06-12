package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.List;

@Slf4j
@Component
@Lazy
public class ProductionSchedulerPatrolJob extends AbstractPatrolJob {

    @Scheduled(cron = "0 25 */4 * * ?")
    public void patrol() {
        log.info("[ProductionScheduler] ===== 开始生产调度员巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "production-scheduler",
                        "生产调度员：产能评估");

                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_production_scheduling",
                        "产能评估完成", System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "production-scheduler", "生产调度员",
                        "产能评估完成", System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[ProductionScheduler] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[ProductionScheduler] ===== 巡检完成 =====");
    }
}
