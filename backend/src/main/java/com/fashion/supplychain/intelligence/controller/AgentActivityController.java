package com.fashion.supplychain.intelligence.controller;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.config.AgentDefinitionsConfig;
import com.fashion.supplychain.intelligence.config.AgentDefinitionsConfig.AgentDefinition;
import com.fashion.supplychain.intelligence.entity.IntelligenceAuditLog;
import com.fashion.supplychain.intelligence.entity.IntelligenceSignal;
import com.fashion.supplychain.intelligence.orchestration.AiAgentTraceOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/intelligence/agent-activity")
@Slf4j
@PreAuthorize("isAuthenticated()")
public class AgentActivityController {

    @Autowired
    private AiAgentTraceOrchestrator traceOrchestrator;

    private static final List<AgentDefinition> AGENT_DEFINITIONS = AgentDefinitionsConfig.AGENT_DEFINITIONS;
    private static final Map<String, List<String>> DOMAIN_TOOLS = AgentDefinitionsConfig.DOMAIN_TOOLS;

    @GetMapping("/agents")
    public Result<List<Map<String, Object>>> getAgentList() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        LocalDateTime since = LocalDateTime.now().minusHours(24);

        Map<String, AgentActivityStats> statsMap = batchComputeAgentStats(tenantId, since);

        List<Map<String, Object>> agents = new ArrayList<>();
        for (AgentDefinition def : AGENT_DEFINITIONS) {
            Map<String, Object> agent = new LinkedHashMap<>();
            agent.put("id", def.id);
            agent.put("name", def.name);
            agent.put("department", def.department);
            agent.put("color", def.color);
            agent.put("description", def.description);

            AgentActivityStats stats = statsMap.getOrDefault(def.id, new AgentActivityStats());
            agent.put("status", stats.currentStatus);
            agent.put("lastActivity", stats.lastActivity);
            agent.put("tasksToday", stats.tasksToday);
            agent.put("successRate", stats.successRate);
            agent.put("avgDurationMs", stats.avgDurationMs);
            agent.put("intelligenceScore", stats.intelligenceScore);
            agent.put("lazinessScore", stats.lazinessScore);
            agent.put("currentTask", stats.currentTask);
            agent.put("position", stats.position);

            agents.add(agent);
        }
        return Result.success(agents);
    }

    @GetMapping("/agents/{agentId}/trajectory")
    public Result<List<Map<String, Object>>> getAgentTrajectory(
            @PathVariable String agentId,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE_TIME) LocalDateTime startTime,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE_TIME) LocalDateTime endTime) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (startTime == null) startTime = LocalDateTime.now().minusHours(24);
        if (endTime == null) endTime = LocalDateTime.now();

        List<String> tools = DOMAIN_TOOLS.getOrDefault(agentId, List.of());
        if (tools.isEmpty()) return Result.success(List.of());

        List<Map<String, Object>> trajectory = new ArrayList<>();
        try {
            QueryWrapper<IntelligenceAuditLog> query = new QueryWrapper<>();
            query.eq("tenant_id", tenantId)
                 .ge("created_at", startTime)
                 .le("created_at", endTime)
                 .orderByAsc("created_at")
                 .last("LIMIT 200");

            List<IntelligenceAuditLog> logs = traceOrchestrator.listAuditLogs(query);
            int step = 0;
            for (IntelligenceAuditLog logEntry : logs) {
                String action = logEntry.getAction() != null ? logEntry.getAction() : "";
                boolean matches = tools.stream().anyMatch(action::contains);
                if (!matches && !"ai-agent:request".equals(action)) continue;

                Map<String, Object> point = new LinkedHashMap<>();
                point.put("time", logEntry.getCreatedAt() != null ? logEntry.getCreatedAt().toString() : null);
                point.put("action", action);
                point.put("status", logEntry.getStatus());
                point.put("durationMs", logEntry.getDurationMs());
                point.put("targetId", logEntry.getTargetId());
                point.put("summary", logEntry.getRemark());
                point.put("step", step++);

                String domain = resolveDomain(action);
                point.put("domain", domain);
                point.put("position", computePosition(domain, step));

                trajectory.add(point);
            }
        } catch (Exception e) {
            log.warn("[AgentActivity] 查询轨迹失败 agentId={}: {}", agentId, e.getMessage());
        }
        return Result.success(trajectory);
    }

    @GetMapping("/departments")
    public Result<List<Map<String, Object>>> getDepartmentStats() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        LocalDateTime since = LocalDateTime.now().minusHours(24);

        Map<String, AgentActivityStats> statsMap = batchComputeAgentStats(tenantId, since);

        Map<String, String> deptNames = Map.of(
                "production", "生产管理部",
                "finance", "财务管理部",
                "warehouse", "仓储管理部",
                "basic", "基础业务部",
                "intelligence", "智能运营部"
        );

        List<Map<String, Object>> departments = new ArrayList<>();
        for (Map.Entry<String, String> entry : deptNames.entrySet()) {
            String deptCode = entry.getKey();
            Map<String, Object> dept = new LinkedHashMap<>();
            dept.put("code", deptCode);
            dept.put("name", entry.getValue());

            List<AgentDefinition> deptAgents = AGENT_DEFINITIONS.stream()
                    .filter(a -> deptCode.equals(a.department))
                    .collect(Collectors.toList());
            dept.put("agentCount", deptAgents.size());
            dept.put("agentIds", deptAgents.stream().map(a -> a.id).collect(Collectors.toList()));

            int totalTasks = 0;
            int successTasks = 0;
            for (AgentDefinition agent : deptAgents) {
                AgentActivityStats stats = statsMap.getOrDefault(agent.id, new AgentActivityStats());
                totalTasks += stats.tasksToday;
                successTasks += (int) Math.round(stats.tasksToday * stats.successRate / 100.0);
            }
            dept.put("totalTasks", totalTasks);
            dept.put("successRate", totalTasks > 0 ? Math.round(successTasks * 100.0 / totalTasks) : 0);
            departments.add(dept);
        }
        return Result.success(departments);
    }

    @GetMapping("/alerts")
    public Result<List<Map<String, Object>>> getAlerts() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<Map<String, Object>> alerts = new ArrayList<>();

        try {
            QueryWrapper<IntelligenceSignal> query = new QueryWrapper<>();
            query.eq("tenant_id", tenantId)
                 .eq("status", "open")
                 .orderByDesc("priority_score")
                 .last("LIMIT 20");
            List<IntelligenceSignal> signals = traceOrchestrator.listSignals(query);

            for (IntelligenceSignal signal : signals) {
                Map<String, Object> alert = new LinkedHashMap<>();
                alert.put("id", signal.getId());
                alert.put("type", signal.getSignalType());
                alert.put("code", signal.getSignalCode());
                alert.put("level", signal.getSignalLevel());
                alert.put("title", signal.getSignalTitle());
                alert.put("detail", signal.getSignalDetail());
                alert.put("priority", signal.getPriorityScore());
                alert.put("domain", signal.getSourceDomain());
                alert.put("time", signal.getCreateTime() != null ? signal.getCreateTime().toString() : null);
                alerts.add(alert);
            }
        } catch (Exception e) {
            log.warn("[AgentActivity] 查询告警失败: {}", e.getMessage());
        }
        return Result.success(alerts);
    }

    private Map<String, AgentActivityStats> batchComputeAgentStats(Long tenantId, LocalDateTime since) {
        Map<String, AgentActivityStats> result = new LinkedHashMap<>();
        try {
            QueryWrapper<IntelligenceAuditLog> query = new QueryWrapper<>();
            query.eq("tenant_id", tenantId)
                 .ge("created_at", since)
                 .orderByDesc("created_at")
                 .last("LIMIT 500");
            List<IntelligenceAuditLog> allLogs = traceOrchestrator.listAuditLogs(query);

            Map<String, List<IntelligenceAuditLog>> logsByAgent = new LinkedHashMap<>();
            for (IntelligenceAuditLog logEntry : allLogs) {
                String action = logEntry.getAction() != null ? logEntry.getAction() : "";
                for (Map.Entry<String, List<String>> entry : DOMAIN_TOOLS.entrySet()) {
                    boolean matches = entry.getValue().stream().anyMatch(action::contains) || "ai-agent:request".equals(action);
                    if (matches) {
                        logsByAgent.computeIfAbsent(entry.getKey(), k -> new ArrayList<>()).add(logEntry);
                        break;
                    }
                }
            }

            for (AgentDefinition def : AGENT_DEFINITIONS) {
                List<IntelligenceAuditLog> agentLogs = logsByAgent.getOrDefault(def.id, Collections.emptyList());
                result.put(def.id, computeStatsFromLogs(def.id, agentLogs));
            }
        } catch (Exception e) {
            log.warn("[AgentActivity] 批量计算智能体统计失败: {}", e.getMessage());
            for (AgentDefinition def : AGENT_DEFINITIONS) {
                AgentActivityStats stats = new AgentActivityStats();
                stats.currentStatus = "unknown";
                stats.position = computePosition("intelligence", 0);
                result.put(def.id, stats);
            }
        }
        return result;
    }

    private AgentActivityStats computeStatsFromLogs(String agentId, List<IntelligenceAuditLog> logs) {
        AgentActivityStats stats = new AgentActivityStats();
        int totalTasks = 0;
        int successTasks = 0;
        long totalDuration = 0;
        int durationCount = 0;
        LocalDateTime lastActivity = null;
        String currentTask = null;
        String currentStatus = "idle";

        for (IntelligenceAuditLog logEntry : logs) {
            totalTasks++;
            if ("SUCCESS".equals(logEntry.getStatus())) successTasks++;
            if (logEntry.getDurationMs() != null && logEntry.getDurationMs() > 0) {
                totalDuration += logEntry.getDurationMs();
                durationCount++;
            }
            if (lastActivity == null && logEntry.getCreatedAt() != null) {
                lastActivity = logEntry.getCreatedAt();
            }
            if ("EXECUTING".equals(logEntry.getStatus()) && currentTask == null) {
                currentTask = logEntry.getRemark() != null ? logEntry.getRemark() : logEntry.getAction();
                currentStatus = "working";
            }
        }

        if (currentStatus.equals("idle") && lastActivity != null) {
            long minutesSinceLast = ChronoUnit.MINUTES.between(lastActivity, LocalDateTime.now());
            if (minutesSinceLast < 5) currentStatus = "idle_recent";
            else if (minutesSinceLast < 30) currentStatus = "idle";
            else currentStatus = "sleeping";
        }

        stats.currentStatus = currentStatus;
        stats.lastActivity = lastActivity != null ? lastActivity.toString() : null;
        stats.tasksToday = totalTasks;
        stats.successRate = totalTasks > 0 ? Math.round(successTasks * 100.0 / totalTasks) : 100;
        stats.avgDurationMs = durationCount > 0 ? totalDuration / durationCount : 0;
        stats.currentTask = currentTask;

        long idleMinutes = lastActivity != null ? ChronoUnit.MINUTES.between(lastActivity, LocalDateTime.now()) : 999;
        stats.lazinessScore = Math.min(100, (int) (idleMinutes / 6.0));
        stats.intelligenceScore = Math.min(100, (int) (stats.successRate * 0.6 + Math.max(0, 100 - stats.lazinessScore) * 0.4));

        String domain = AGENT_DEFINITIONS.stream()
                .filter(a -> a.id.equals(agentId))
                .map(a -> a.department)
                .findFirst().orElse("intelligence");
        stats.position = computePosition(domain, totalTasks);

        return stats;
    }

    private String resolveDomain(String action) {
        if (action == null) return "intelligence";
        if (action.contains("order") || action.contains("team_dispatch") || action.contains("production"))
            return "production";
        if (action.contains("material") || action.contains("purchase") || action.contains("reconciliation"))
            return "production";
        if (action.contains("finance") || action.contains("payment") || action.contains("expense"))
            return "finance";
        if (action.contains("warehouse") || action.contains("inventory") || action.contains("sample_loan"))
            return "warehouse";
        if (action.contains("style") || action.contains("sample") || action.contains("pattern"))
            return "basic";
        return "intelligence";
    }

    private Map<String, Integer> computePosition(String domain, int step) {
        Map<String, Double> basePositions = Map.of(
                "production", 25.0,
                "finance", 50.0,
                "warehouse", 75.0,
                "basic", 15.0,
                "intelligence", 55.0
        );
        double baseX = basePositions.getOrDefault(domain, 50.0);
        double baseY = 30.0 + (domain.hashCode() % 40);
        double offsetX = Math.sin(step * 0.7) * 8;
        double offsetY = Math.cos(step * 0.5) * 5;
        Map<String, Integer> pos = new LinkedHashMap<>();
        pos.put("x", (int) Math.round(baseX + offsetX));
        pos.put("y", (int) Math.round(baseY + offsetY));
        return pos;
    }

    private static class AgentActivityStats {
        String currentStatus = "idle";
        String lastActivity;
        int tasksToday;
        long successRate = 100;
        long avgDurationMs;
        int intelligenceScore = 50;
        int lazinessScore = 0;
        String currentTask;
        Map<String, Integer> position;
    }
}
