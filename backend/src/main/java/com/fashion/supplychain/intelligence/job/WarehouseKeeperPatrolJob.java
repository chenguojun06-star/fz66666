package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
public class WarehouseKeeperPatrolJob extends AbstractPatrolJob {

    @Scheduled(cron = "0 45 */6 * * ?")
    public void patrol() {
        log.info("[WarehouseKeeper] ===== 开始仓库管理员巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "warehouse-keeper",
                        "仓库管理员：库存盘点");

                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_warehouse_management",
                        "库存盘点完成", System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "warehouse-keeper", "仓库管理员",
                        "库存盘点完成", System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[WarehouseKeeper] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[WarehouseKeeper] ===== 巡检完成 =====");
    }
}
