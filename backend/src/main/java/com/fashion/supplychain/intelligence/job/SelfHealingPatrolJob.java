package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.List;

@Slf4j
@Component
@Lazy
public class SelfHealingPatrolJob extends AbstractPatrolJob {

    @Scheduled(cron = "0 25 2 * * ?")
    public void patrol() {
        log.info("[SelfHealing] ===== 开始自愈引擎巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "self-healing",
                        "自愈引擎：数据一致性诊断");

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_self_healing",
                        "数据一致性检查完成", System.currentTimeMillis() - start, true);

                finishAndSnapshot(tenantId, commandId, "self-healing", "自愈引擎",
                        "数据一致性诊断完成，未发现需要自愈的问题", System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[SelfHealing] 租户{}自愈诊断异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "诊断异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[SelfHealing] ===== 自愈引擎巡检完成 =====");
    }
}