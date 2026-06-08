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
public class DeliverySpecialistPatrolJob extends AbstractPatrolJob {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Scheduled(cron = "0 10 */4 * * ?")
    public void patrol() {
        log.info("[DeliverySpecialist] ===== 开始交付专家巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "delivery-specialist",
                        "交付专家：订单健康评分+交付风险预警");

                long s1 = System.currentTimeMillis();
                List<ProductionOrder> activeOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .last("LIMIT 30")
                        .list();

                int lowHealthCount = 0;
                for (ProductionOrder o : activeOrders) {
                    int score = computeHealthScore(o);
                    if (score < 50) {
                        lowHealthCount++;
                    }
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_delivery_prediction",
                        String.format("健康评分：扫描%d单，低健康评分%d单", activeOrders.size(), lowHealthCount),
                        System.currentTimeMillis() - s1, true);

                long s2 = System.currentTimeMillis();
                long overdueCount = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getPlannedEndDate)
                        .lt(ProductionOrder::getPlannedEndDate, LocalDateTime.now())
                        .count();

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_delay_trend",
                        String.format("延期趋势：逾期订单%d单", overdueCount),
                        System.currentTimeMillis() - s2, true);

                finishAndSnapshot(tenantId, commandId, "delivery-specialist", "交付专家",
                        String.format("交付专家巡检完成，低健康评分%d单，逾期%d单", lowHealthCount, overdueCount),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[DeliverySpecialist] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[DeliverySpecialist] ===== 巡检完成 =====");
    }
}