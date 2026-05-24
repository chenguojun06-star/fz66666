package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiPatrolAction;
import com.fashion.supplychain.intelligence.orchestration.PatrolClosedLoopOrchestrator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequestMapping("/api/intelligence/patrol")
@PreAuthorize("isAuthenticated()")
public class AiPatrolController {

    @Autowired
    private PatrolClosedLoopOrchestrator patrolOrchestrator;

    @GetMapping("/actions/by-target")
    public Result<List<AiPatrolAction>> getActionsByTarget(
            @RequestParam String targetType,
            @RequestParam String targetId,
            @RequestParam(defaultValue = "10") int limit) {
        Long tenantId = UserContext.tenantId();
        return Result.success(patrolOrchestrator.listByTarget(tenantId, targetType, targetId, limit));
    }

    @GetMapping("/actions/recent")
    public Result<List<AiPatrolAction>> getRecentActions(
            @RequestParam(defaultValue = "20") int limit) {
        Long tenantId = UserContext.tenantId();
        return Result.success(patrolOrchestrator.listRecentByTenant(tenantId, limit));
    }

    @GetMapping("/summary")
    public Result<Map<String, Object>> getPatrolSummary() {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("pendingCount", patrolOrchestrator.countPendingByTenant(tenantId));
        summary.put("autoExecutedToday", patrolOrchestrator.countAutoExecutedToday(tenantId));
        summary.put("highRiskPending", patrolOrchestrator.countHighRiskPending(tenantId));
        List<AiPatrolAction> recent = patrolOrchestrator.listRecentByTenant(tenantId, 5);
        List<Map<String, String>> recentItems = recent.stream().map(a -> {
            Map<String, String> m = new LinkedHashMap<>();
            m.put("issueType", a.getIssueType());
            m.put("detectedIssue", a.getDetectedIssue());
            m.put("issueSeverity", a.getIssueSeverity());
            m.put("status", a.getStatus());
            m.put("targetType", a.getTargetType());
            m.put("targetId", a.getTargetId());
            return m;
        }).toList();
        summary.put("recentActions", recentItems);
        return Result.success(summary);
    }

    @PostMapping("/actions/{id}/approve")
    public Result<Void> approveAction(@PathVariable Long id, @RequestBody Map<String, String> body) {
        patrolOrchestrator.approve(id,
                String.valueOf(UserContext.userId()),
                UserContext.username(),
                body.getOrDefault("remark", ""));
        return Result.success(null);
    }

    @PostMapping("/actions/{id}/reject")
    public Result<Void> rejectAction(@PathVariable Long id, @RequestBody Map<String, String> body) {
        patrolOrchestrator.reject(id,
                String.valueOf(UserContext.userId()),
                UserContext.username(),
                body.getOrDefault("remark", ""));
        return Result.success(null);
    }
}