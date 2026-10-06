package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.finance.orchestration.PayableOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * D-754：应付账款逾期标记定时任务。
 * 修复「应收有定时逾期 Job、应付只有手动接口 /markOverdue」的不对称——
 * 没有定时标记，付款计划的逾期状态和红色高亮就一直靠人手触发才更新。
 */
@Slf4j
@Component
public class PayableOverdueJob extends AbstractPatrolJob {

    private final PayableOrchestrator payableOrchestrator;

    public PayableOverdueJob(@Lazy PayableOrchestrator payableOrchestrator) {
        this.payableOrchestrator = payableOrchestrator;
    }

    @Scheduled(cron = "0 30 7 * * ?")
    public void patrol() {
        log.info("[PayableOverdue] ===== 应付逾期标记开始 =====");
        var tenants = getActiveTenantIds();
        for (Long tenantId : tenants) {
            try {
                var marked = new int[]{0};
                withTenantContext(tenantId, () -> marked[0] = payableOrchestrator.markOverdue());
                if (marked[0] > 0) {
                    log.info("[PayableOverdue] 租户{} 标记逾期应付 {} 笔", tenantId, marked[0]);
                }
            } catch (Exception e) {
                log.warn("[PayableOverdue] 租户{} 逾期标记异常: {}", tenantId, e.getMessage());
            }
        }
        log.info("[PayableOverdue] ===== 应付逾期标记完成 =====");
    }
}
