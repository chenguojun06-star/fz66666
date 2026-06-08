package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
public class SmartAdvisorPatrolJob extends AbstractPatrolJob {

    @Scheduled(cron = "0 5 */3 * * ?")
    public void patrol() {
        log.info("[SmartAdvisor] ===== 开始智能顾问巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "smart-advisor",
                        "智能顾问：综合建议生成");

                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_smart_advice",
                        "综合建议生成完成", System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "smart-advisor", "智能顾问",
                        "综合建议生成完成", System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[SmartAdvisor] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[SmartAdvisor] ===== 巡检完成 =====");
    }
}
