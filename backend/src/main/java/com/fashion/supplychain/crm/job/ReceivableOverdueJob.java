package com.fashion.supplychain.crm.job;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 应收单逾期自动标记定时任务
 * <p>
 * 每天凌晨 1:00 执行，将已过到期日且状态为 PENDING/PARTIAL 的应收单自动标记为 OVERDUE。
 * 按租户隔离迭代，防止跨租户写入。
 */
@Slf4j
@Component
public class ReceivableOverdueJob {

    @Autowired
    private ReceivableOrchestrator receivableOrchestrator;

    @Autowired
    private ProcessStatsEngine processStatsEngine;

    @Scheduled(cron = "0 0 1 * * ?")
    public void markOverdueReceivables() {
        List<Long> tenantIds;
        try {
            tenantIds = processStatsEngine.findActiveTenantIds();
        } catch (Exception e) {
            log.error("[ReceivableOverdueJob] 获取活跃租户列表失败，任务中止", e);
            return;
        }

        int totalCount = 0;
        for (Long tenantId : tenantIds) {
            if (tenantId == null) continue;
            TenantAssert.bindTenantForTask(tenantId, "应收逾期标记");
            try {
                int count = receivableOrchestrator.markOverdue();
                totalCount += count;
                if (count > 0) {
                    log.info("[ReceivableOverdueJob] 租户 {} 标记逾期应收单 {} 条", tenantId, count);
                }
            } catch (Exception e) {
                log.error("[ReceivableOverdueJob] 租户 {} 逾期标记失败", tenantId, e);
            } finally {
                TenantAssert.clearTenantContext();
            }
        }
        if (totalCount > 0) {
            log.info("[ReceivableOverdueJob] 共标记逾期应收单 {} 条，涉及 {} 个租户", totalCount, tenantIds.size());
        }
    }
}
