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
import java.util.stream.Collectors;

@Slf4j
@Component
@Lazy
public class DataAnalystPatrolJob extends AbstractPatrolJob {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Scheduled(cron = "0 0 8 * * ?")
    public void dailyReport() {
        log.info("[DataAnalyst] ===== 开始每日经营数据分析 =====");
        List<Long> tenants = getActiveTenantIds();
        int totalFindings = 0;

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "data-analyst",
                        "数据分析师：每日经营数据摘要生成");
                int findings = 0;

                long activeOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .count();
                long overdueOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getPlannedEndDate)
                        .lt(ProductionOrder::getPlannedEndDate, LocalDateTime.now())
                        .count();

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_system_overview",
                        String.format("订单概览：活跃%d单，逾期%d单", activeOrders, overdueOrders),
                        System.currentTimeMillis() - start, true);

                long s2 = System.currentTimeMillis();
                long urgentOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getPlannedEndDate)
                        .le(ProductionOrder::getPlannedEndDate, LocalDateTime.now().plusDays(3))
                        .count();

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_delay_trend",
                        String.format("延期趋势：3天内到期%d单", urgentOrders),
                        System.currentTimeMillis() - s2, true);

                long s3 = System.currentTimeMillis();
                List<ProductionOrder> criticalOrders = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getPlannedEndDate)
                        .le(ProductionOrder::getPlannedEndDate, LocalDateTime.now().plusDays(5))
                        .lt(ProductionOrder::getProductionProgress, 40)
                        .last("LIMIT 10")
                        .list();

                if (!criticalOrders.isEmpty()) {
                    String orderList = criticalOrders.stream()
                            .map(o -> o.getOrderNo() + "(" + pct(o) + "%)")
                            .collect(Collectors.joining("、"));
                    String issue = String.format("数据分析师发现%d个高危订单(5天内到期+进度<40%%): %s",
                            criticalOrders.size(), orderList);
                    patrolOrchestrator.createAction("DATA_ANALYST_JOB", issue, "DEADLINE_RISK",
                            "HIGH", "order", orderList,
                            "{\"action\":\"data_analysis_alert\"}",
                            BigDecimal.valueOf(0.85), "NEED_APPROVAL");
                    findings++;
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_deep_analysis",
                        String.format("深度分析：发现%d个高危订单", criticalOrders.size()),
                        System.currentTimeMillis() - s3, true);

                long s4 = System.currentTimeMillis();
                String reportSummary = String.format(
                        "每日经营摘要：活跃订单%d，逾期%d，3天内到期%d，高危%d",
                        activeOrders, overdueOrders, urgentOrders, criticalOrders.size());
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_smart_report",
                        reportSummary, System.currentTimeMillis() - s4, true);

                totalFindings += findings;
                finishAndSnapshot(tenantId, commandId, "data-analyst", "数据分析师",
                        reportSummary, System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[DataAnalyst] 租户{}分析异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "分析异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[DataAnalyst] ===== 每日分析完成，发现 {} 个问题 =====", totalFindings);
    }
}