package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.intelligence.orchestration.OrderLearningRefreshOrchestrator;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import java.util.List;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class OrderLearningRefreshJob {

    @Autowired
    private OrderLearningRefreshOrchestrator orderLearningRefreshOrchestrator;

    @Autowired
    private ProcessStatsEngine processStatsEngine;

    @Autowired(required = false)
    private DistributedLockService distributedLockService;

    @Scheduled(cron = "0 40 3 * * ?")
    public void refreshRecentLearningData() {
        String lockValue = distributedLockService == null
                ? null
                : distributedLockService.tryLock("job:order-learning-refresh", 30, TimeUnit.MINUTES);
        if (distributedLockService != null && lockValue == null) {
            log.info("[下单学习Job] 其他实例正在执行，跳过");
            return;
        }
        try {
            doRefresh();
        } finally {
            if (distributedLockService != null && lockValue != null) {
                distributedLockService.unlock("job:order-learning-refresh", lockValue);
            }
        }
    }

    private void doRefresh() {
        List<Long> tenants = processStatsEngine.findActiveTenantIds();
        if (tenants == null || tenants.isEmpty()) {
            log.info("[下单学习Job] 无活跃租户，跳过");
            return;
        }
        int successCount = 0;
        int totalRefreshed = 0;
        for (Long tenantId : tenants) {
            UserContext previous = UserContext.get();
            try {
                UserContext ctx = new UserContext();
                ctx.setTenantId(tenantId);
                ctx.setUsername("system");
                ctx.setUserId("system");
                UserContext.set(ctx);
                int refreshed = orderLearningRefreshOrchestrator.refreshRecentOrdersForTenant(tenantId, 200);
                totalRefreshed += refreshed;
                successCount++;
            } catch (Exception ex) {
                log.warn("[下单学习Job] 租户 {} 刷新失败", tenantId, ex);
            } finally {
                if (previous != null) {
                    UserContext.set(previous);
                } else {
                    UserContext.clear();
                }
            }
        }
        log.info("[下单学习Job] 完成，成功租户={}，刷新订单数={}", successCount, totalRefreshed);
    }
}
