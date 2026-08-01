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
public class LogisticsSpecialistPatrolJob extends AbstractPatrolJob {

    /** 外发无响应超时阈值（小时） */
    private static final long OUTSOURCE_NO_RESPONSE_HOURS = 48L;

    @Scheduled(cron = "0 40 */6 * * ?")
    public void patrol() {
        log.info("[LogisticsSpecialist] ===== 开始物流专家巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "logistics-specialist",
                        "物流专家：库存水位分析+物流效率评估");

                long s1 = System.currentTimeMillis();
                // P0-3 修复：查询外发无响应>48h的订单，创建 DELIVERY_EXCEPTION 工单
                List<Map<String, Object>> noResponseOrders = queryOutsourceNoResponseOrders(tenantId);
                if (!noResponseOrders.isEmpty() && isPatrolEnabledForTenant(tenantId)) {
                    String orderList = noResponseOrders.stream()
                            .map(o -> String.valueOf(o.get("order_no")))
                            .limit(5)
                            .collect(Collectors.joining("、"));
                    String issue = String.format("物流专家：发现%d个外发无响应>%dh订单: %s",
                            noResponseOrders.size(), OUTSOURCE_NO_RESPONSE_HOURS, orderList);
                    withTenantContext(tenantId, () -> patrolOrchestrator.createAction(
                            "LOGISTICS_SPECIALIST_JOB", issue, "DELIVERY_EXCEPTION",
                            "HIGH", "order", orderList,
                            "{\"action\":\"delivery_exception_alert\"}",
                            BigDecimal.valueOf(0.85), "NEED_APPROVAL"));
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_logistics",
                        String.format("库存水位分析完成，发现%d个外发无响应订单", noResponseOrders.size()),
                        System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "logistics-specialist", "物流专家",
                        String.format("库存水位分析完成，发现%d个外发无响应订单", noResponseOrders.size()),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[LogisticsSpecialist] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[LogisticsSpecialist] ===== 巡检完成 =====");
    }

    /** 查询外发后超时无扫码响应的订单（已分配工厂但超过阈值无扫码记录） */
    private List<Map<String, Object>> queryOutsourceNoResponseOrders(Long tenantId) {
        try {
            return jdbcTemplate.queryForList(
                    "SELECT po.order_no FROM t_production_order po " +
                    "WHERE po.tenant_id = ? AND po.delete_flag = 0 " +
                    "AND po.factory_name IS NOT NULL AND po.factory_name <> '' " +
                    "AND po.status NOT IN ('completed','cancelled','scrapped','archived','closed') " +
                    "AND po.create_time < DATE_SUB(NOW(), INTERVAL ? HOUR) " +
                    "AND NOT EXISTS (SELECT 1 FROM t_scan_record sr WHERE sr.tenant_id = po.tenant_id " +
                    "AND sr.order_no = po.order_no AND sr.confirm_time IS NOT NULL) " +
                    "LIMIT 20",
                    tenantId, OUTSOURCE_NO_RESPONSE_HOURS);
        } catch (Exception e) {
            log.warn("[LogisticsSpecialist] 查询外发无响应订单失败: tenant={}, error={}", tenantId, e.getMessage());
            return List.of();
        }
    }
}
