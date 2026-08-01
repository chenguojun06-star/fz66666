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
public class FinanceSettlerPatrolJob extends AbstractPatrolJob {

    /** 工资异常倍率阈值（> 平均工资 * 此倍率 视为异常） */
    private static final double WAGE_ANOMALY_MULTIPLIER = 2.0;

    @Scheduled(cron = "0 40 */8 * * ?")
    public void patrol() {
        log.info("[FinanceSettler] ===== 开始财务结算员巡检 =====");
        List<Long> tenants = getActiveTenantIds();

        for (Long tenantId : tenants) {
            long start = System.currentTimeMillis();
            String commandId = null;
            try {
                commandId = traceOrchestrator.startPatrolRequest(tenantId, "finance-settler",
                        "财务结算员：账单结算巡检");

                long s1 = System.currentTimeMillis();
                // P0-3 修复：查询工资异常（>2倍平均），创建 PAYROLL_ANOMALY 工单
                List<Map<String, Object>> anomalousPayments = queryWageAnomalies(tenantId);
                if (!anomalousPayments.isEmpty() && isPatrolEnabledForTenant(tenantId)) {
                    String orderList = anomalousPayments.stream()
                            .map(p -> String.valueOf(p.getOrDefault("biz_no", p.getOrDefault("payment_no", ""))))
                            .filter(s -> !s.isEmpty())
                            .limit(5)
                            .collect(Collectors.joining("、"));
                    String issue = String.format("财务结算员：发现%d笔工资异常(>%s倍平均): %s",
                            anomalousPayments.size(), WAGE_ANOMALY_MULTIPLIER, orderList);
                    withTenantContext(tenantId, () -> patrolOrchestrator.createAction(
                            "FINANCE_SETTLER_JOB", issue, "PAYROLL_ANOMALY",
                            "MEDIUM", "payment", orderList,
                            "{\"action\":\"payroll_anomaly_alert\"}",
                            BigDecimal.valueOf(0.8), "NEED_APPROVAL"));
                }

                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_finance_settlement",
                        String.format("账单结算巡检完成，发现%d笔工资异常", anomalousPayments.size()),
                        System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "finance-settler", "财务结算员",
                        String.format("账单结算巡检完成，发现%d笔工资异常", anomalousPayments.size()),
                        System.currentTimeMillis() - start);
            } catch (Exception e) {
                log.warn("[FinanceSettler] 租户{}巡检异常: {}", tenantId, e.getMessage());
                if (commandId != null) {
                    traceOrchestrator.finishPatrolRequest(tenantId, commandId,
                            null, "巡检异常: " + e.getMessage(), System.currentTimeMillis() - start);
                }
            }
        }
        log.info("[FinanceSettler] ===== 巡检完成 =====");
    }

    /** 查询工资支付金额超过均值 N 倍的异常记录 */
    private List<Map<String, Object>> queryWageAnomalies(Long tenantId) {
        try {
            return jdbcTemplate.queryForList(
                    "SELECT payment_no, biz_no, amount FROM t_wage_payment " +
                    "WHERE tenant_id = ? AND status = 'success' " +
                    "AND amount > (SELECT AVG(amount) * ? FROM t_wage_payment WHERE tenant_id = ? AND status = 'success') " +
                    "LIMIT 20",
                    tenantId, WAGE_ANOMALY_MULTIPLIER, tenantId);
        } catch (Exception e) {
            log.warn("[FinanceSettler] 查询工资异常记录失败: tenant={}, error={}", tenantId, e.getMessage());
            return List.of();
        }
    }
}
