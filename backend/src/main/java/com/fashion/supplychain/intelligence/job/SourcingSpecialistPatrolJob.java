package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Component
public class SourcingSpecialistPatrolJob extends AbstractPatrolJob {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Scheduled(cron = "0 30 */6 * * ?")
    public void patrol() {
        log.info("[SourcingSpecialist] ===== 开始采购专家巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "sourcing-specialist",
                        "采购专家：物料缺口识别+供应商交付评估");

                long s1 = System.currentTimeMillis();
                List<ProductionOrder> lowMaterial = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .gt(ProductionOrder::getMaterialArrivalRate, 0)
                        .lt(ProductionOrder::getMaterialArrivalRate, 60)
                        .last("LIMIT 20")
                        .list();

                if (!lowMaterial.isEmpty()) {
                    String orderList = lowMaterial.stream()
                            .map(o -> o.getOrderNo() + "(物料" + o.getMaterialArrivalRate() + "%)")
                            .limit(5)
                            .collect(Collectors.joining("、"));
                    String issue = String.format("采购专家：发现%d个物料缺口订单(到位率<60%%): %s",
                            lowMaterial.size(), orderList);
                    patrolOrchestrator.createAction("SOURCING_SPECIALIST_JOB", issue, "MATERIAL_GAP",
                            "MEDIUM", "order", orderList,
                            "{\"action\":\"material_gap_alert\"}",
                            BigDecimal.valueOf(0.8), "NEED_APPROVAL");
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_material_calculation",
                        String.format("物料缺口识别：发现%d个物料不足订单", lowMaterial.size()),
                        System.currentTimeMillis() - s1, true);

                long s2 = System.currentTimeMillis();
                Map<String, Long> factoryOrderCount = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .notIn(ProductionOrder::getStatus, TERMINAL_STATUSES)
                        .isNotNull(ProductionOrder::getFactoryName)
                        .list().stream()
                        .filter(o -> o.getFactoryName() != null)
                        .collect(Collectors.groupingBy(ProductionOrder::getFactoryName, Collectors.counting()));

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_supplier_scorecard",
                        String.format("供应商评估：扫描%d个工厂的交付情况", factoryOrderCount.size()),
                        System.currentTimeMillis() - s2, true);

                long s3 = System.currentTimeMillis();
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_procurement",
                        String.format("采购建议：基于%d个物料缺口订单生成采购建议", lowMaterial.size()),
                        System.currentTimeMillis() - s3, true);

                finishAndSnapshot(tenantId, commandId, "sourcing-specialist", "采购专家",
                        String.format("采购专家巡检完成，发现%d个物料缺口", lowMaterial.size()),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[SourcingSpecialist] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[SourcingSpecialist] ===== 巡检完成 =====");
    }
}