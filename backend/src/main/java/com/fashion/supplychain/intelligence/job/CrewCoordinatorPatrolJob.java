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
public class CrewCoordinatorPatrolJob extends AbstractPatrolJob {

    /** 工时异常倍率阈值（实际工时 > 标准工时 * 此倍率 视为成本超支） */
    private static final long COST_OVERRUN_HOURS_THRESHOLD = 24L;

    @Scheduled(cron = "0 35 */4 * * ?")
    public void patrol() {
        log.info("[CrewCoordinator] ===== 开始人员协调员巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "crew-coordinator",
                        "人员协调员：产能协调");

                long s1 = System.currentTimeMillis();
                // P0-3 修复：查询工时>标准2倍的记录，创建 COST_OVERRUN 工单
                List<Map<String, Object>> overrunRecords = queryCostOverrunRecords(tenantId);
                if (!overrunRecords.isEmpty() && isPatrolEnabledForTenant(tenantId)) {
                    String orderList = overrunRecords.stream()
                            .map(r -> String.valueOf(r.getOrDefault("order_no", "")))
                            .filter(s -> !s.isEmpty())
                            .limit(5)
                            .collect(Collectors.joining("、"));
                    String issue = String.format("人员协调员：发现%d条工时异常(>%dh)记录: %s",
                            overrunRecords.size(), COST_OVERRUN_HOURS_THRESHOLD, orderList);
                    withTenantContext(tenantId, () -> patrolOrchestrator.createAction(
                            "CREW_COORDINATOR_JOB", issue, "COST_OVERRUN",
                            "MEDIUM", "labor", orderList,
                            "{\"action\":\"cost_overrun_alert\"}",
                            BigDecimal.valueOf(0.75), "NEED_APPROVAL"));
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_crew_coordination",
                        String.format("产能协调完成，发现%d条工时异常记录", overrunRecords.size()),
                        System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "crew-coordinator", "人员协调员",
                        String.format("产能协调完成，发现%d条工时异常记录", overrunRecords.size()),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[CrewCoordinator] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[CrewCoordinator] ===== 巡检完成 =====");
    }

    /** 查询工序耗时异常长的扫码记录（confirm_time - receive_time > 阈值，视为工时超支） */
    private List<Map<String, Object>> queryCostOverrunRecords(Long tenantId) {
        try {
            return jdbcTemplate.queryForList(
                    "SELECT order_no, style_no, process_code, receive_time, confirm_time " +
                    "FROM t_scan_record " +
                    "WHERE tenant_id = ? AND confirm_time IS NOT NULL AND receive_time IS NOT NULL " +
                    "AND TIMESTAMPDIFF(HOUR, receive_time, confirm_time) > ? " +
                    "LIMIT 20",
                    tenantId, COST_OVERRUN_HOURS_THRESHOLD);
        } catch (Exception e) {
            log.warn("[CrewCoordinator] 查询工时异常记录失败: tenant={}, error={}", tenantId, e.getMessage());
            return List.of();
        }
    }
}
