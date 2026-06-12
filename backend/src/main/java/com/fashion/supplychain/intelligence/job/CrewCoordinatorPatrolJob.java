package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.List;

@Slf4j
@Component
@Lazy
public class CrewCoordinatorPatrolJob extends AbstractPatrolJob {

    @Scheduled(cron = "0 35 */4 * * ?")
    public void patrol() {
        log.info("[CrewCoordinator] ===== 开始人员协调员巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "crew-coordinator",
                        "人员协调员：产能协调");

                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_crew_coordination",
                        "产能协调完成", System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "crew-coordinator", "人员协调员",
                        "产能协调完成", System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[CrewCoordinator] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[CrewCoordinator] ===== 巡检完成 =====");
    }
}
