package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.intelligence.orchestration.SupplierScorecardOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * D-754：供应商评分卡每日刷新。
 * 修复「评分卡只在有人打开面板时才计算」的懒更新——工厂画像
 * （t_factory 的评级/准时率/品质分/完成率/订单统计）从此每天自动保新，
 * AI 寻源推荐与选厂决策吃到的永远是近 3 个月真实数据，而不是上次有人看时的快照。
 */
@Slf4j
@Component
public class SupplierScorecardRefreshJob extends AbstractPatrolJob {

    private final SupplierScorecardOrchestrator supplierScorecardOrchestrator;

    public SupplierScorecardRefreshJob(@Lazy SupplierScorecardOrchestrator supplierScorecardOrchestrator) {
        this.supplierScorecardOrchestrator = supplierScorecardOrchestrator;
    }

    @Scheduled(cron = "0 40 2 * * ?")
    public void patrol() {
        long begin = System.currentTimeMillis();
        log.info("[SupplierScorecard] ===== 供应商评分卡每日刷新开始 =====");
        var tenants = getActiveTenantIds();
        int refreshed = 0;
        for (Long tenantId : tenants) {
            try {
                withTenantContext(tenantId, () -> {
                    var resp = supplierScorecardOrchestrator.scorecard();
                    log.info("[SupplierScorecard] 租户{} 刷新完成: {}", tenantId, resp.getSummary());
                });
                refreshed++;
            } catch (Exception e) {
                log.warn("[SupplierScorecard] 租户{} 刷新异常: {}", tenantId, e.getMessage());
            }
        }
        log.info("[SupplierScorecard] ===== 刷新完成 {}/{} 租户，耗时 {}ms =====",
                refreshed, tenants.size(), System.currentTimeMillis() - begin);
    }
}
