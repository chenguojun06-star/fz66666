package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.List;

@Slf4j
@Component
@Lazy
public class StyleDesignerPatrolJob extends AbstractPatrolJob {

    @Scheduled(cron = "0 0 10 * * ?")
    public void patrol() {
        log.info("[StyleDesigner] ===== 开始款式设计师巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "style-designer",
                        "款式设计师：款式趋势分析");

                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_style_trend",
                        "款式趋势分析完成", System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "style-designer", "款式设计师",
                        "款式趋势分析完成", System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[StyleDesigner] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[StyleDesigner] ===== 巡检完成 =====");
    }
}
