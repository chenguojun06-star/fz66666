package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceSignalOrchestrator;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import com.fashion.supplychain.common.lock.DistributedLockService;
import java.util.List;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 智能信号定期采集任务
 *
 * <p>每30分钟自动采集所有活跃租户的风险信号（异常检测、交付风险、物料短缺、服装专属信号），
 * 持久化到 t_intelligence_signal 表，供前端智能驾驶舱实时展示。
 *
 * <p>需要为每个租户模拟 UserContext（因为 collectAndAnalyze 依赖 UserContext.tenantId()）。
 */
@Component
@Slf4j
public class IntelligenceSignalCollectionJob {

    @Autowired
    private IntelligenceSignalOrchestrator signalOrchestrator;

    @Autowired
    private ProcessStatsEngine processStatsEngine;

    @Autowired(required = false)
    private DistributedLockService distributedLockService;

    // 错开到 :10 和 :40，避免与其他定时任务同时触发 DB/Redis 连接风暴
    @Scheduled(cron = "0 10/30 * * * ?")
    public void periodicCollect() {
        if (distributedLockService != null) {
            String lockValue = distributedLockService.tryLock("job:signal-collection", 25, TimeUnit.MINUTES);
            if (lockValue == null) {
                log.info("[信号采集Job] 其他实例正在执行，跳过");
                return;
            }
            try {
                doCollect();
            } finally {
                distributedLockService.unlock("job:signal-collection", lockValue);
            }
        } else {
            doCollect();
        }
    }

    private void doCollect() {
        List<Long> tenants = processStatsEngine.findActiveTenantIds();
        if (tenants == null || tenants.isEmpty()) {
            return;
        }

        log.info("[信号采集Job] 开始采集 {} 个租户的风险信号", tenants.size());
        int success = 0;
        int failed = 0;

        for (Long tenantId : tenants) {
            try {
                UserContext ctx = new UserContext();
                ctx.setTenantId(tenantId);
                ctx.setUserId("SYSTEM_JOB");
                ctx.setUsername("系统定时采集");
                UserContext.set(ctx);

                signalOrchestrator.collectAndAnalyze();
                success++;
            } catch (Exception e) {
                failed++;
                log.warn("[信号采集Job] 租户 {} 采集失败: {}", tenantId, e.getMessage());
            } finally {
                UserContext.clear();
            }
        }

        if (failed > 0) {
            log.warn("[信号采集Job] 采集完成（有失败）成功={} 失败={}", success, failed);
        } else {
            log.info("[信号采集Job] 采集完成 成功={}", success);
        }
    }
}
