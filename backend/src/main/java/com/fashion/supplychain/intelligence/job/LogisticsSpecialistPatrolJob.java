package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.List;

@Slf4j
@Component
@Lazy
public class LogisticsSpecialistPatrolJob extends AbstractPatrolJob {

    @Scheduled(cron = "0 40 */6 * * ?")
    public void patrol() {
        log.info("[LogisticsSpecialist] ===== 开始物流专家巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "logistics-specialist",
                        "物流专家：库存水位分析+物流效率评估");

                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_logistics",
                        "库存水位分析完成", System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "logistics-specialist", "物流专家",
                        "库存水位分析完成", System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[LogisticsSpecialist] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[LogisticsSpecialist] ===== 巡检完成 =====");
    }
}