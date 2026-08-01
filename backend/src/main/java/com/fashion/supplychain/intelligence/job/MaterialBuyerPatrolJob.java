package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Component
@Lazy
public class MaterialBuyerPatrolJob extends AbstractPatrolJob {

    /** 物料到货率异常阈值（< 此值视为物料短缺） */
    private static final int MATERIAL_ARRIVAL_RATE_THRESHOLD = 50;

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
                // P0-3 修复：查询物料到货率<50%的订单，创建 MATERIAL_SHORT 工单
                List<Map<String, Object>> lowMaterialOrders = queryLowMaterialOrders(tenantId);
                if (!lowMaterialOrders.isEmpty() && isPatrolEnabledForTenant(tenantId)) {
                    String orderList = lowMaterialOrders.stream()
                            .map(o -> String.valueOf(o.get("order_no")))
                            .limit(5)
                            .collect(Collectors.joining("、"));
                    String issue = String.format("物料采购员：发现%d个物料到货率<%d%%订单: %s",
                            lowMaterialOrders.size(), MATERIAL_ARRIVAL_RATE_THRESHOLD, orderList);
                    withTenantContext(tenantId, () -> patrolOrchestrator.createAction(
                            "MATERIAL_BUYER_JOB", issue, "MATERIAL_SHORT",
                            "MEDIUM", "order", orderList,
                            "{\"action\":\"material_short_alert\"}",
                            BigDecimal.valueOf(0.8), "NEED_APPROVAL"));
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_material_calculation",
                        String.format("物料计算完成，发现%d个物料短缺订单", lowMaterialOrders.size()),
                        System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "material-buyer", "物料采购员",
                        String.format("物料到货情况巡检完成，发现%d个物料短缺订单", lowMaterialOrders.size()),
                        System.currentTimeMillis() - start);
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

    /** 查询物料到货率低于阈值的活跃订单 */
    private List<Map<String, Object>> queryLowMaterialOrders(Long tenantId) {
        try {
            return jdbcTemplate.queryForList(
                    "SELECT order_no FROM t_production_order " +
                    "WHERE tenant_id = ? AND delete_flag = 0 " +
                    "AND material_arrival_rate > 0 AND material_arrival_rate < ? " +
                    "AND status NOT IN ('completed','cancelled','scrapped','archived','closed') " +
                    "LIMIT 20",
                    tenantId, MATERIAL_ARRIVAL_RATE_THRESHOLD);
        } catch (Exception e) {
            log.warn("[MaterialBuyer] 查询物料到货率异常订单失败: tenant={}, error={}", tenantId, e.getMessage());
            return List.of();
        }
    }
}
