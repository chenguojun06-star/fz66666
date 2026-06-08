package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
public class EvolutionEnginePatrolJob extends AbstractPatrolJob {

    @Scheduled(cron = "0 0 6 * * ?")
    public void patrol() {
        log.info("[EvolutionEngine] ===== 开始进化引擎巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "evolution-engine",
                        "进化引擎：反馈驱动进化");

                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_evolution",
                        "反馈驱动进化完成", System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "evolution-engine", "进化引擎",
                        "反馈驱动进化完成", System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[EvolutionEngine] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[EvolutionEngine] ===== 巡检完成 =====");
    }
}