package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiMetricsSnapshot;
import com.fashion.supplychain.intelligence.mapper.AiMetricsSnapshotMapper;
import com.fashion.supplychain.intelligence.mapper.CollaborationTaskMapper;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiMetricsOrchestrator {

    private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final AiMetricsSnapshotMapper metricsMapper;
    private final CollaborationTaskMapper collaborationTaskMapper;

    public Map<String, Object> getCurrentMetrics() {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("tenantId", tenantId);
        metrics.put("generatedAt", LocalDateTime.now().format(DATE_TIME_FORMATTER));

        LocalDate today = LocalDate.now();
        List<AiMetricsSnapshot> recent = metricsMapper.findRecentByTenant(tenantId, today.minusDays(30), 10);
        metrics.put("recentSnapshots", recent.size());

        if (!recent.isEmpty()) {
            AiMetricsSnapshot latest = recent.get(0);
            metrics.put("latest", toView(latest));
        }

        int activeTasks = collaborationTaskMapper.countByTenantAndStatus(tenantId, "PENDING")
                + collaborationTaskMapper.countByTenantAndStatus(tenantId, "IN_PROGRESS")
                + collaborationTaskMapper.countByTenantAndStatus(tenantId, "ESCALATED");
        int overdueTasks = collaborationTaskMapper.countByTenantAndStatus(tenantId, "PENDING");

        Map<String, Integer> taskStats = new LinkedHashMap<>();
        taskStats.put("activeTasks", activeTasks);
        taskStats.put("pendingTasks", collaborationTaskMapper.countByTenantAndStatus(tenantId, "PENDING"));
        taskStats.put("inProgressTasks", collaborationTaskMapper.countByTenantAndStatus(tenantId, "IN_PROGRESS"));
        taskStats.put("escalatedTasks", collaborationTaskMapper.countByTenantAndStatus(tenantId, "ESCALATED"));
        taskStats.put("completedToday", collaborationTaskMapper.countByTenantAndStatus(tenantId, "COMPLETED"));
        metrics.put("taskStats", taskStats);

        return metrics;
    }

    public void generateSnapshot() {
        try {
            AiMetricsSnapshot snapshot = new AiMetricsSnapshot();
            snapshot.setSnapshotDate(LocalDate.now());
            snapshot.setCreatedAt(LocalDateTime.now());

            AiMetricsSnapshot existing = metricsMapper.findPlatformByDate(LocalDate.now());
            if (existing != null) {
                metricsMapper.deleteById(existing.getId());
            }

            metricsMapper.insert(snapshot);
            log.info("[Metrics] 平台级指标快照已生成: {}", LocalDate.now());
        } catch (Exception e) {
            log.warn("[Metrics] 快照生成失败: {}", e.getMessage());
        }
    }

    private Map<String, Object> toView(AiMetricsSnapshot s) {
        if (s == null) return Collections.emptyMap();
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("date", s.getSnapshotDate() != null ? s.getSnapshotDate().toString() : null);
        v.put("intentHitRate", s.getIntentHitRate());
        v.put("toolCallSuccessRate", s.getToolCallSuccessRate());
        v.put("firstResponseAcceptRate", s.getFirstResponseAcceptRate());
        v.put("manualOverrideRate", s.getManualOverrideRate());
        v.put("approvalTurnaroundAvgMinutes", s.getApprovalTurnaroundAvgMinutes());
        v.put("totalAiRequests", s.getTotalAiRequests());
        v.put("totalToolCalls", s.getTotalToolCalls());
        v.put("totalEscalations", s.getTotalEscalations());
        v.put("activeCollabTasks", s.getActiveCollabTasks());
        v.put("overdueCollabTasks", s.getOverdueCollabTasks());
        v.put("avgAgentIterations", s.getAvgAgentIterations());
        v.put("costEstimatedCents", s.getCostEstimatedCents());
        return v;
    }
}
