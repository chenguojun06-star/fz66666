package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
public class HyperAdvisorPatrolJob extends AbstractPatrolJob {

    @Scheduled(cron = "0 0 9 * * ?")
    public void patrol() {
        log.info("[HyperAdvisor] ===== 开始超级顾问巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "hyper-advisor",
                        "超级顾问：深度推演+风险模拟");

                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_hyper_advisor",
                        "深度推演完成", System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "hyper-advisor", "超级顾问",
                        "深度推演完成", System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[HyperAdvisor] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[HyperAdvisor] ===== 巡检完成 =====");
    }
}