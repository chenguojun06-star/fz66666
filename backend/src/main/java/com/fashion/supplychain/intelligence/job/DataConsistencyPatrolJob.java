package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.SelfHealingResponse;
import com.fashion.supplychain.intelligence.orchestration.ReconciliationAnomalyOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.SelfHealingOrchestrator;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.orchestration.SystemIssueCollectorOrchestrator;
import com.fashion.supplychain.system.service.TenantService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.List;

@Slf4j
@Component
@Lazy
public class DataConsistencyPatrolJob {

    /** P0 修复：3 个 @Scheduled 方法均加 enabled 开关，避免误触发污染数据 */
    @Value("${xiaoyun.job.data-consistency-patrol.enabled:true}")
    private boolean enabled;

    @Autowired
    private SelfHealingOrchestrator selfHealingOrchestrator;

    @Autowired
    private SystemIssueCollectorOrchestrator systemIssueCollectorOrchestrator;

    @Autowired
    private ReconciliationAnomalyOrchestrator reconciliationAnomalyOrchestrator;

    @Autowired
    private TenantService tenantService;

    @Scheduled(fixedRate = 6 * 60 * 60 * 1000, initialDelay = 10 * 60 * 1000)
    public void selfHealingPatrol() {
        if (!enabled) {
            log.debug("[DataConsistencyPatrol] 自愈巡检已禁用");
            return;
        }
        log.info("[DataConsistencyPatrol] 自愈巡检开始");
        List<Tenant> tenants = tenantService.list();
        for (Tenant tenant : tenants) {
            if (tenant.getId() == null) continue;
            try {
                UserContext.set(buildContext(tenant));
                SelfHealingResponse result = selfHealingOrchestrator.diagnose();
                if (result.getIssuesFound() > 0) {
                    log.warn("[DataConsistencyPatrol] 租户{}发现{}个问题，健康分={}",
                            tenant.getId(), result.getIssuesFound(), result.getHealthScore());
                }
            } catch (Exception e) {
                log.warn("[DataConsistencyPatrol] 租户{}自愈巡检失败: {}", tenant.getId(), e.getMessage());
            } finally {
                UserContext.clear();
            }
        }
        log.info("[DataConsistencyPatrol] 自愈巡检完成");
    }

    @Scheduled(fixedRate = 30 * 60 * 1000, initialDelay = 5 * 60 * 1000)
    public void systemIssuePatrol() {
        if (!enabled) {
            log.debug("[DataConsistencyPatrol] 系统问题巡检已禁用");
            return;
        }
        log.info("[DataConsistencyPatrol] 系统问题巡检开始");
        try {
            systemIssueCollectorOrchestrator.collect();
            log.info("[DataConsistencyPatrol] 系统问题巡检完成");
        } catch (Exception e) {
            log.warn("[DataConsistencyPatrol] 系统问题巡检失败: {}", e.getMessage());
        }
    }

    @Scheduled(cron = "0 0 8 * * ?")
    public void reconciliationAnomalyPatrol() {
        if (!enabled) {
            log.debug("[DataConsistencyPatrol] 对账异常巡检已禁用");
            return;
        }
        log.info("[DataConsistencyPatrol] 对账异常巡检开始");
        List<Tenant> tenants = tenantService.list();
        for (Tenant tenant : tenants) {
            if (tenant.getId() == null) continue;
            try {
                UserContext.set(buildContext(tenant));
                var result = reconciliationAnomalyOrchestrator.analyze();
                if (result != null && result.getItems() != null && !result.getItems().isEmpty()) {
                    log.warn("[DataConsistencyPatrol] 租户{}发现{}个对账异常",
                            tenant.getId(), result.getItems().size());
                }
            } catch (Exception e) {
                log.warn("[DataConsistencyPatrol] 租户{}对账异常巡检失败: {}", tenant.getId(), e.getMessage());
            } finally {
                UserContext.clear();
            }
        }
        log.info("[DataConsistencyPatrol] 对账异常巡检完成");
    }

    private UserContext buildContext(Tenant tenant) {
        UserContext ctx = new UserContext();
        ctx.setTenantId(tenant.getId());
        ctx.setSuperAdmin(false);
        return ctx;
    }
}
