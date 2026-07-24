package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.orchestration.AiAgentTraceOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.PatrolClosedLoopOrchestrator;
import com.fashion.supplychain.intelligence.service.AgentContextFileService;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.service.BackendActionFlagService;
import com.fashion.supplychain.system.service.BackendActionFlagService.BackendActionKey;
import com.fashion.supplychain.system.service.TenantService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
public abstract class AbstractPatrolJob {

    protected static final Set<String> TERMINAL_STATUSES =
            Set.of("completed", "cancelled", "scrapped", "archived", "closed");

    @Autowired protected TenantService tenantService;
    @Autowired protected ProcessStatsEngine processStatsEngine;
    @Autowired protected AiAgentTraceOrchestrator traceOrchestrator;
    @Autowired protected PatrolClosedLoopOrchestrator patrolOrchestrator;
    @Autowired protected AgentContextFileService agentContextFileService;
    @Autowired protected JdbcTemplate jdbcTemplate;
    @Autowired protected BackendActionFlagService backendActionFlagService;

    protected boolean isPatrolEnabledForTenant(Long tenantId) {
        if (tenantId == null || backendActionFlagService == null) {
            return false;
        }
        try {
            return backendActionFlagService.isEnabled(tenantId, BackendActionKey.AUTO_PATROL_EXEC);
        } catch (Exception e) {
            log.debug("[AbstractPatrol] 检查巡检开关失败 tenantId={} 返回false", tenantId, e);
            return false;
        }
    }

    protected List<Long> getActiveTenantIds() {
        List<Long> tenants = processStatsEngine != null
                ? processStatsEngine.findActiveTenantIds()
                : null;
        if (tenants == null || tenants.isEmpty()) {
            List<Tenant> all = tenantService.list();
            tenants = all.stream()
                    .filter(t -> !"DISABLED".equalsIgnoreCase(t.getStatus())
                            && !"SUSPENDED".equalsIgnoreCase(t.getStatus()))
                    .map(Tenant::getId)
                    .collect(Collectors.toList());
        }
        return tenants;
    }

    protected void withTenantContext(Long tenantId, Runnable action) {
        UserContext previous = UserContext.get();
        try {
            UserContext ctx = new UserContext();
            ctx.setTenantId(tenantId);
            ctx.setUsername("system");
            ctx.setUserId("system");
            UserContext.set(ctx);
            action.run();
        } finally {
            if (previous != null) {
                UserContext.set(previous);
            } else {
                UserContext.clear();
            }
        }
    }

    protected void savePatrolSnapshot(Long tenantId, String agentId, String agentName, String summary) {
        try {
            String fileName = "patrol-snapshot-" + agentId;
            String truncatedSummary = summary != null && summary.length() > 1800
                    ? summary.substring(0, 1800) + "...(已截断)" : summary;
            String content = String.format("# %s 巡检快照\n> 更新时间: %s\n\n%s",
                    agentName, LocalDateTime.now().toString(), truncatedSummary);
            if (content.length() > 2000) {
                content = content.substring(0, 1997) + "...";
            }
            agentContextFileService.createOrUpdate(tenantId, fileName, content, -10, "patrol");
        } catch (Exception e) {
            log.debug("[PatrolSnapshot] 写入上下文失败(tenant={},agent={}): {}",
                    tenantId, agentId, e.getMessage());
        }
    }

    protected void finishAndSnapshot(Long tenantId, String commandId, String agentId,
                                     String agentName, String summary, long elapsedMs) {
        traceOrchestrator.finishPatrolRequest(tenantId, commandId, summary, null, elapsedMs);
        savePatrolSnapshot(tenantId, agentId, agentName, summary);
    }

    protected int pct(ProductionOrder o) {
        return o.getProductionProgress() != null ? o.getProductionProgress() : 0;
    }

    protected int computeHealthScore(ProductionOrder o) {
        int score = 70;
        int progress = o.getProductionProgress() != null ? o.getProductionProgress() : 0;

        if (progress >= 80) score += 20;
        else if (progress >= 50) score += 10;
        else if (progress < 20) score -= 20;

        if (o.getPlannedEndDate() != null) {
            long daysLeft = ChronoUnit.DAYS.between(LocalDate.now(), o.getPlannedEndDate().toLocalDate());
            if (daysLeft < 0) score -= 30;
            else if (daysLeft <= 3) score -= 15;
            else if (daysLeft <= 7) score -= 5;
        }

        if (o.getMaterialArrivalRate() != null && o.getMaterialArrivalRate() > 0) {
            if (o.getMaterialArrivalRate() < 50) score -= 10;
        }

        return Math.max(0, Math.min(100, score));
    }
}