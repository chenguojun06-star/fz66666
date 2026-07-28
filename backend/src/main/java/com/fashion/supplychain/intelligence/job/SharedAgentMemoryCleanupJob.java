package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.intelligence.service.SharedAgentMemoryService;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 多Agent共享记忆定时清理
 *
 * <p>每天 04:00 清理过期共享记忆（expire_time &lt; NOW()）</p>
 *
 * @author xiaoyun
 * @since 2026-07-22
 */
@Slf4j
@Component
@Lazy
public class SharedAgentMemoryCleanupJob {

    @Autowired
    private SharedAgentMemoryService sharedAgentMemoryService;

    @Autowired
    private DistributedLockService distributedLockService;

    @Scheduled(cron = "0 0 4 * * ?")
    public void cleanup() {
        String lockValue = distributedLockService.tryLock(
                "job:shared-agent-memory-cleanup", 30, TimeUnit.MINUTES);
        if (lockValue == null) {
            log.info("[SharedAgentMemoryCleanup] 未获取到分布式锁，跳过本次执行");
            return;
        }
        try {
            sharedAgentMemoryService.purgeExpired();
        } catch (Exception e) {
            log.warn("[SharedAgentMemoryCleanup] 清理失败(不影响主流程): {}", e.getMessage());
        } finally {
            distributedLockService.unlock("job:shared-agent-memory-cleanup", lockValue);
        }
    }
}
