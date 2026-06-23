package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.List;

@Slf4j
@Component
@Lazy
public class LearningEnginePatrolJob extends AbstractPatrolJob {

    @Scheduled(cron = "0 40 5 * * ?")
    public void patrol() {
        log.info("[LearningEngine] ===== 开始学习引擎巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "learning-engine",
                        "学习引擎：模式学习更新");

                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_pattern_learning",
                        "模式学习更新完成", System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "learning-engine", "学习引擎",
                        "模式学习更新完成", System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[LearningEngine] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[LearningEngine] ===== 巡检完成 =====");
    }
}
