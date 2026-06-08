package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
public class QualityInspectorPatrolJob extends AbstractPatrolJob {

    @Scheduled(cron = "0 30 */8 * * ?")
    public void patrol() {
        log.info("[QualityInspector] ===== 开始质量检验员巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "quality-inspector",
                        "质量检验员：质量合格分析");

                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_quality_inspection",
                        "质量检验完成", System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "quality-inspector", "质量检验员",
                        "质量合格分析完成", System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[QualityInspector] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[QualityInspector] ===== 巡检完成 =====");
    }
}
