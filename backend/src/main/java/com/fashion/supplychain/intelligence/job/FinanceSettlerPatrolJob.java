package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.List;

@Slf4j
@Component
@Lazy
public class FinanceSettlerPatrolJob extends AbstractPatrolJob {

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
                traceOrchestrator.recordPatrolStep(tenantId, commandId, "tool_finance_settlement",
                        "账单结算巡检完成", System.currentTimeMillis() - s1, true);

                finishAndSnapshot(tenantId, commandId, "finance-settler", "财务结算员",
                        "账单结算巡检完成", System.currentTimeMillis() - start);
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
}
