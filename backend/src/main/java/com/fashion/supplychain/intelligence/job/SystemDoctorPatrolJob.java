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

    /**
     * 【P2-3修复】任务开关，默认 true（不影响现有行为）。
     * 运维可通过 yml/env 关闭：xiaoyun.job.system-doctor-patrol.enabled=false
     */
    @org.springframework.beans.factory.annotation.Value("${xiaoyun.job.system-doctor-patrol.enabled:true}")
    private boolean enabled;

    @Scheduled(cron = "0 0 4 * * ?")
    public void patrol() {
        if (!enabled) {
            log.debug("[SystemDoctor] 已禁用（xiaoyun.job.system-doctor-patrol.enabled=false）");
            return;
        }
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
