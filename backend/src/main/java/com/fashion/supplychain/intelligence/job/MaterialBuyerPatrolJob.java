package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
public class MaterialBuyerPatrolJob extends AbstractPatrolJob {

    @Scheduled(cron = "0 20 */6 * * ?")
    public void patrol() {
        log.info("[MaterialBuyer] ===== 开始物料采购员巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "material-buyer",
                        "物料采购员：物料到货情况巡检");

                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_material_calculation",
                        "物料计算完成", System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "material-buyer", "物料采购员",
                        "物料到货情况巡检完成", System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[MaterialBuyer] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[MaterialBuyer] ===== 巡检完成 =====");
    }
}
