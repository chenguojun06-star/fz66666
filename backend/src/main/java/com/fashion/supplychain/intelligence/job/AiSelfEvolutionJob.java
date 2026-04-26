package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import com.fashion.supplychain.intelligence.service.AiSelfEvolutionService;
import java.util.List;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class AiSelfEvolutionJob {

    @Autowired
    private AiSelfEvolutionService aiSelfEvolutionService;

    @Autowired
    private ProcessStatsEngine processStatsEngine;

    @Autowired
    private DistributedLockService distributedLockService;

    @Scheduled(cron = "0 30 3 * * ?")
    public void runAutoEvolutionForAllTenants() {
        String lockValue = distributedLockService.tryLock(
                "job:ai-self-evolution", 30, TimeUnit.MINUTES);
        if (lockValue == null) {
            log.info("[AiSelfEvolutionJob] 未获取到分布式锁，跳过本次执行");
            return;
        }
        try {
            List<Long> tenantIds = processStatsEngine.findActiveTenantIds();
            log.info("[AiSelfEvolutionJob] ===== 开始 AI 自进化 活跃租户={} =====", tenantIds.size());

            int evolved = 0, skipped = 0, failed = 0;
            for (Long tenantId : tenantIds) {
                UserContext ctx = new UserContext();
                ctx.setTenantId(tenantId);
                ctx.setUserId("SYSTEM_JOB");
                ctx.setUsername("AI自进化定时任务");
                UserContext.set(ctx);
                try {
                    String result = aiSelfEvolutionService.evolve(tenantId, 7);
                    if (result.contains("EVOLVED")) {
                        evolved++;
                        log.info("[AiSelfEvolutionJob] 租户{} 自进化完成", tenantId);
                    } else {
                        skipped++;
                        log.debug("[AiSelfEvolutionJob] 租户{} 无低反馈样本，跳过", tenantId);
                    }
                } catch (Exception e) {
                    failed++;
                    log.warn("[AiSelfEvolutionJob] 租户{} 自进化失败: {}", tenantId, e.getMessage());
                } finally {
                    UserContext.clear();
                }
            }
            log.info("[AiSelfEvolutionJob] ===== 完成 进化={} 跳过={} 失败={} =====",
                    evolved, skipped, failed);
        } finally {
            distributedLockService.unlock("job:ai-self-evolution", lockValue);
        }
    }
}
