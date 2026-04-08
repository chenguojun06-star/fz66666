package com.fashion.supplychain.crm.job;

import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 应收单逾期自动标记定时任务
 * <p>
 * 每天凌晨 1:00 执行，将已过到期日且状态为 PENDING/PARTIAL 的应收单自动标记为 OVERDUE。
 * 跨所有租户生效，无需租户上下文。
 */
@Slf4j
@Component
public class ReceivableOverdueJob {

    @Autowired
    private ReceivableOrchestrator receivableOrchestrator;

    @Scheduled(cron = "0 0 1 * * ?")
    public void markOverdueReceivables() {
        try {
            int count = receivableOrchestrator.markOverdue();
            if (count > 0) {
                log.info("[ReceivableOverdueJob] 本次标记逾期应收单 {} 条", count);
            }
        } catch (Exception e) {
            log.error("[ReceivableOverdueJob] 逾期标记任务执行失败", e);
        }
    }
}
