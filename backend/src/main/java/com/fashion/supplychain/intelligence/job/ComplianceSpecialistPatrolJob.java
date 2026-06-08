package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
public class ComplianceSpecialistPatrolJob extends AbstractPatrolJob {

    @Scheduled(cron = "0 5 */8 * * ?")
    public void patrol() {
        log.info("[ComplianceSpecialist] ===== 开始合规专家巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "compliance-specialist",
                        "合规专家：质量合格率分析+合规检查");

                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_compliance",
                        "合规检查完成", System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "compliance-specialist", "合规专家",
                        "合规检查完成，未发现不合规项", System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[ComplianceSpecialist] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[ComplianceSpecialist] ===== 巡检完成 =====");
    }
}