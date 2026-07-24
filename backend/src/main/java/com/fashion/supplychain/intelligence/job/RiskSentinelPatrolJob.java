package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Component
@Lazy
public class RiskSentinelPatrolJob extends AbstractPatrolJob {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Scheduled(cron = "0 5 */2 * * ?")
    public void patrol() {
        log.info("[RiskSentinel] ===== 开始风险哨兵巡检 =====");
        List<Long> tenants = getActiveTenantIds();
        int totalFindings = 0;

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "risk-sentinel",
                        "风险哨兵：组合风险扫描");
                int findings = 0;

                long s1 = System.currentTimeMillis();
                List<ProductionOrder> atRisk = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getPlannedEndDate)
                        .lt(ProductionOrder::getPlannedEndDate, LocalDateTime.now().plusDays(7))
                        .last("LIMIT 30")
                        .list();

                int comboRiskCount = 0;
                boolean patrolEnabled = isPatrolEnabledForTenant(tenantId);
                for (ProductionOrder o : atRisk) {
                    int riskFactors = 0;
                    if (o.getPlannedEndDate() != null && o.getPlannedEndDate().isBefore(LocalDateTime.now())) {
                        riskFactors++;
                    }
                    if (o.getProductionProgress() != null && o.getProductionProgress() < 30) {
                        riskFactors++;
                    }
                    if (o.getMaterialArrivalRate() != null && o.getMaterialArrivalRate() > 0
                            && o.getMaterialArrivalRate() < 50) {
                        riskFactors++;
                    }
                    if (riskFactors >= 2) {
                        comboRiskCount++;
                        if (patrolEnabled) {
                            String issue = String.format("风险哨兵：订单[%s]存在组合风险(逾期%s+进度%d%%+物料%d%%)",
                                    o.getOrderNo(),
                                    o.getPlannedEndDate().isBefore(LocalDateTime.now()) ? "是" : "否",
                                    o.getProductionProgress() != null ? o.getProductionProgress() : 0,
                                    o.getMaterialArrivalRate() != null ? o.getMaterialArrivalRate() : 0);
                            patrolOrchestrator.createAction("RISK_SENTINEL_JOB", issue, "COMBO_RISK",
                                    "HIGH", "order", o.getOrderNo(),
                                    "{\"action\":\"combo_risk_alert\"}",
                                    BigDecimal.valueOf(0.9), "NEED_APPROVAL");
                        }
                    }
                }
                if (!patrolEnabled && comboRiskCount > 0) {
                    log.debug("[RiskSentinel] 租户 {} 巡检自动执行开关未开启，跳过创建 {} 个工单", tenantId, comboRiskCount);
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_anomaly_detection",
                        String.format("异常检测：扫描%d单，发现%d个组合风险", atRisk.size(), comboRiskCount),
                        System.currentTimeMillis() - s1, true);

                long s2 = System.currentTimeMillis();
                long overdueCount = atRisk.stream()
                        .filter(o -> o.getPlannedEndDate() != null && o.getPlannedEndDate().isBefore(LocalDateTime.now()))
                        .count();
                long lowProgressCount = atRisk.stream()
                        .filter(o -> o.getProductionProgress() != null && o.getProductionProgress() < 30)
                        .count();

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_root_cause_analysis",
                        String.format("根因分析：逾期%d单，低进度(<30%%)%d单", overdueCount, lowProgressCount),
                        System.currentTimeMillis() - s2, true);

                long s3 = System.currentTimeMillis();
                List<ProductionOrder> stagnantOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getMerchandiser)
                        .last("LIMIT 50")
                        .list();

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_personnel_delay_analysis",
                        String.format("人员延期分析：扫描%d个有跟单员的订单", stagnantOrders.size()),
                        System.currentTimeMillis() - s3, true);

                long s4 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_delivery_prediction",
                        String.format("交付预测：基于%d个活跃订单评估交付风险", atRisk.size()),
                        System.currentTimeMillis() - s4, true);

                findings = comboRiskCount;
                totalFindings += findings;
                finishAndSnapshot(tenantId, commandId, "risk-sentinel", "风险哨兵",
                        String.format("风险哨兵巡检完成，发现%d个组合风险", findings),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[RiskSentinel] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[RiskSentinel] ===== 巡检完成，发现 {} 个组合风险 =====", totalFindings);
    }
}