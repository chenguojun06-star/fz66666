package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.List;

@Slf4j
@Component
@Lazy
public class CriticAgentPatrolJob extends AbstractPatrolJob {

    @Scheduled(cron = "0 10 1 * * ?")
    public void patrol() {
        log.info("[CriticAgent] ===== 开始批评检查官巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "critic-agent",
                        "批评检查官：审查AI输出质量");

                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_critic",
                        "AI输出质量审查完成", System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "critic-agent", "批评检查官",
                        "AI输出质量审查完成", System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[CriticAgent] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[CriticAgent] ===== 巡检完成 =====");
    }
}