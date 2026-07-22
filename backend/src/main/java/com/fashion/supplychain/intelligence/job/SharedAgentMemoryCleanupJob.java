package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.intelligence.service.SharedAgentMemoryService;
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

    @Scheduled(cron = "0 0 4 * * ?")
    public void cleanup() {
        try {
            sharedAgentMemoryService.purgeExpired();
        } catch (Exception e) {
            log.warn("[SharedAgentMemoryCleanup] 清理失败(不影响主流程): {}", e.getMessage());
        }
    }
}
