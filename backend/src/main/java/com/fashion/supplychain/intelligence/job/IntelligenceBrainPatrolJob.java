package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.List;

@Slf4j
@Component
@Lazy
public class IntelligenceBrainPatrolJob extends AbstractPatrolJob {

    @Scheduled(cron = "0 35 */2 * * ?")
    public void patrol() {
        log.info("[IntelligenceBrain] ===== 开始智能中枢巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "intelligence-brain",
                        "智能中枢：健康度聚合+风险脉搏");

                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_intelligence_brain",
                        "系统健康度聚合完成", System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "intelligence-brain", "智能中枢",
                        "系统健康度聚合完成", System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[IntelligenceBrain] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[IntelligenceBrain] ===== 巡检完成 =====");
    }
}