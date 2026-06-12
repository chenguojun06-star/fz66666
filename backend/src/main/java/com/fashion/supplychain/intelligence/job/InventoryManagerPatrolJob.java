package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.List;

@Slf4j
@Component
@Lazy
public class InventoryManagerPatrolJob extends AbstractPatrolJob {

    @Scheduled(cron = "0 50 */6 * * ?")
    public void patrol() {
        log.info("[InventoryManager] ===== 开始库存经理巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "inventory-manager",
                        "库存经理：库存预警");

                long s1 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_inventory_warning",
                        "库存预警完成", System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "inventory-manager", "库存经理",
                        "库存预警完成", System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[InventoryManager] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[InventoryManager] ===== 巡检完成 =====");
    }
}
