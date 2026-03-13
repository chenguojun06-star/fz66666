package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.intelligence.orchestration.PatternDiscoveryOrchestrator;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import java.util.List;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 自主Agent定时任务 — 每天凌晨3点自动挖掘规律（按租户隔离）。
 */
@Slf4j
@Component
public class AutonomousAgentJob {

    @Autowired private PatternDiscoveryOrchestrator patternOrchestrator;
    @Autowired private ProcessStatsEngine processStatsEngine;
    @Autowired private DistributedLockService distributedLockService;

    private static final int LOOKBACK_DAYS = 30;

    @Scheduled(cron = "0 0 3 * * ?")
    public void discoverPatternsForAllTenants() {
        String lockValue = distributedLockService.tryLock("job:autonomous-pattern-discovery", 25, TimeUnit.MINUTES);
        if (lockValue == null) {
            log.info("[AutonomousJob] 未获取到锁，跳过本次执行");
            return;
        }
        try {
            List<Long> tenantIds = processStatsEngine.findActiveTenantIds();
            log.info("[AutonomousJob] 开始规律挖掘，活跃租户数={}", tenantIds.size());
            int success = 0, failed = 0;
            for (Long tenantId : tenantIds) {
                UserContext ctx = new UserContext();
                ctx.setTenantId(tenantId);
                ctx.setUserId("SYSTEM_JOB");
                ctx.setUsername("自主Agent定时任务");
                UserContext.set(ctx);
                try {
                    patternOrchestrator.discoverPatterns(LOOKBACK_DAYS);
                    success++;
                } catch (Exception e) {
                    failed++;
                    log.warn("[AutonomousJob] 租户{} 规律挖掘失败: {}", tenantId, e.getMessage());
                } finally {
                    UserContext.clear();
                }
            }
            log.info("[AutonomousJob] 规律挖掘完成 成功={} 失败={}", success, failed);
        } finally {
            distributedLockService.unlock("job:autonomous-pattern-discovery", lockValue);
        }
    }
}
