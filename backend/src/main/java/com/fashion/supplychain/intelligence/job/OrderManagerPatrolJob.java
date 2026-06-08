package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Component
public class OrderManagerPatrolJob extends AbstractPatrolJob {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Scheduled(cron = "0 15 */4 * * ?")
    public void patrol() {
        log.info("[OrderManager] ===== 开始订单管家巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "order-manager",
                        "订单管家：订单状态巡检");

                long s1 = System.currentTimeMillis();
                long activeOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .count();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_order_edit",
                        String.format("订单状态巡检：活跃订单%d", activeOrders),
                        System.currentTimeMillis() - s1, true);

                long s2 = System.currentTimeMillis();
                long overdueCount = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getPlannedEndDate)
                        .lt(ProductionOrder::getPlannedEndDate, LocalDateTime.now())
                        .count();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_order_contact_urge",
                        String.format("催单扫描：逾期订单%d", overdueCount),
                        System.currentTimeMillis() - s2, true);

                finishAndSnapshot(tenantId, commandId, "order-manager", "订单管家",
                        String.format("订单管家巡检完成，活跃%d，逾期%d", activeOrders, overdueCount),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[OrderManager] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[OrderManager] ===== 巡检完成 =====");
    }
}
