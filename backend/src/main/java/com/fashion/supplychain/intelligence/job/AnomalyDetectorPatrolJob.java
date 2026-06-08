package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Slf4j
@Component
public class AnomalyDetectorPatrolJob extends AbstractPatrolJob {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Scheduled(cron = "0 20 */4 * * ?")
    public void patrol() {
        log.info("[AnomalyDetector] ===== 开始异常检测器巡检 =====");
        List<Long> tenants = getActiveTenantIds();
        int totalFindings = 0;

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "anomaly-detector",
                        "异常检测器：对账异常+工厂瓶颈+物料短缺检测");
                int findings = 0;

                long s1 = System.currentTimeMillis();
                List<ProductionOrder> activeOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .last("LIMIT 50")
                        .list();

                int anomalyCount = 0;
                for (ProductionOrder o : activeOrders) {
                    if (o.getPlannedEndDate() != null) {
                        long hoursSinceUpdate = ChronoUnit.HOURS.between(
                                o.getUpdateTime() != null ? o.getUpdateTime() : o.getCreateTime(),
                                LocalDateTime.now());
                        
                        if (hoursSinceUpdate > 48 && o.getProductionProgress() != null && o.getProductionProgress() < 80) {
                            anomalyCount++;
                            String issue = String.format("异常检测：订单[%s]超过48小时未更新(进度%d%%)",
                                    o.getOrderNo(), o.getProductionProgress());
                            patrolOrchestrator.createAction("ANOMALY_DETECTOR_JOB", issue, "STAGNANT_ORDER",
                                    "MEDIUM", "order", o.getOrderNo(),
                                    "{\"action\":\"stagnant_alert\"}",
                                    BigDecimal.valueOf(0.7), "NEED_APPROVAL");
                            findings++;
                        }
                    }
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_anomaly_detection",
                        String.format("停滞检测：扫描%d单，发现%d个停滞订单", activeOrders.size(), anomalyCount),
                        System.currentTimeMillis() - s1, true);

                long s2 = System.currentTimeMillis();
                List<ProductionOrder> materialIssues = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getMaterialArrivalRate)
                        .lt(ProductionOrder::getMaterialArrivalRate, 80)
                        .last("LIMIT 20")
                        .list();

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_material_calculation",
                        String.format("物料检测：发现%d个物料到料率不足80%%的订单", materialIssues.size()),
                        System.currentTimeMillis() - s2, true);

                totalFindings += findings;
                finishAndSnapshot(tenantId, commandId, "anomaly-detector", "异常检测器",
                        String.format("异常检测完成：发现%d个停滞订单", findings),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[AnomalyDetector] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[AnomalyDetector] ===== 巡检完成，发现 {} 个异常 =====", totalFindings);
    }
}