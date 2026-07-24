package com.fashion.supplychain.crm.job;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.crm.orchestration.ReceivableOrchestrator;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import com.fashion.supplychain.production.orchestration.SysNoticeOrchestrator;
import com.fashion.supplychain.system.service.BackendActionFlagService;
import com.fashion.supplychain.system.service.BackendActionFlagService.BackendActionKey;
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
 * <p>
 * 逾期通知推送受开关 {@code backend.action.auto_receivable_notify} 控制（默认关闭），
 * 遵循用户诉求"智能化不自动执行，让用户可以设置"。
 */
@Slf4j
@Component
public class ReceivableOverdueJob {

    @Autowired
    private ReceivableOrchestrator receivableOrchestrator;

    @Autowired
    private ProcessStatsEngine processStatsEngine;

    @Autowired
    private BackendActionFlagService backendActionFlagService;

    @Autowired(required = false)
    private SysNoticeOrchestrator sysNoticeOrchestrator;

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
                    // 逾期通知受开关控制（默认关闭，用户需在智能化配置面板手动开启）
                    notifyOverdueIfEnabled(tenantId, count);
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

    /**
     * 在开关开启时推送逾期应收通知给管理员。
     * <p>
     * 开关未开启时仅标记逾期状态，不发送任何通知（安全降级）。
     */
    private void notifyOverdueIfEnabled(Long tenantId, int overdueCount) {
        boolean notifyEnabled = backendActionFlagService.isEnabled(tenantId, BackendActionKey.AUTO_RECEIVABLE_NOTIFY);
        if (!notifyEnabled) {
            log.debug("[ReceivableOverdueJob] 租户 {} 逾期通知开关未开启，跳过通知推送", tenantId);
            return;
        }
        if (sysNoticeOrchestrator == null) {
            log.debug("[ReceivableOverdueJob] SysNoticeOrchestrator 未注入，跳过通知推送");
            return;
        }
        try {
            String title = "应收单逾期提醒";
            String content = String.format("今日共有 %d 笔应收单已逾期，请及时跟进催收。", overdueCount);
            sysNoticeOrchestrator.sendAnomalyToManagers(tenantId, "RECEIVABLE_OVERDUE", title, content);
            log.info("[ReceivableOverdueJob] 租户 {} 逾期通知已推送 count={}", tenantId, overdueCount);
        } catch (Exception e) {
            log.warn("[ReceivableOverdueJob] 租户 {} 逾期通知推送失败: {}", tenantId, e.getMessage());
        }
    }
}
