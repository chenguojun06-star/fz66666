package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.List;

@Slf4j
@Component
@Lazy
public class SystemDoctorPatrolJob extends AbstractPatrolJob {

    @Scheduled(cron = "0 15 4 * * ?")
    public void patrol() {
        log.info("[SystemDoctor] ===== 开始系统医生巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "system-doctor",
                        "系统医生：系统健康诊断");

                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_system_health",
                        "系统健康诊断完成", System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "system-doctor", "系统医生",
                        "系统健康诊断完成", System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[SystemDoctor] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[SystemDoctor] ===== 巡检完成 =====");
    }
}
