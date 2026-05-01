package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.entity.CollaborationTask;
import com.fashion.supplychain.intelligence.mapper.CollaborationTaskMapper;
import java.time.LocalDateTime;
import java.util.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Slf4j
@Service
@RequiredArgsConstructor
public class TaskCenterOrchestrator {

    private final CollaborationTaskMapper collaborationTaskMapper;

    public Map<String, Object> getDashboard() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        Map<String, Object> dashboard = new LinkedHashMap<>();
        dashboard.put("tenantId", tenantId);
        dashboard.put("generatedAt", LocalDateTime.now().toString());

        int pending = collaborationTaskMapper.countByTenantAndStatus(tenantId, "PENDING");
        int inProgress = collaborationTaskMapper.countByTenantAndStatus(tenantId, "IN_PROGRESS");
        int completed = collaborationTaskMapper.countByTenantAndStatus(tenantId, "COMPLETED");
        int escalated = collaborationTaskMapper.countByTenantAndStatus(tenantId, "ESCALATED");

        Map<String, Integer> summary = new LinkedHashMap<>();
        summary.put("pending", pending);
        summary.put("inProgress", inProgress);
        summary.put("completed", completed);
        summary.put("escalated", escalated);
        summary.put("total", pending + inProgress + completed + escalated);
        dashboard.put("summary", summary);

        List<CollaborationTask> activeTasks = collaborationTaskMapper.findActiveByTenant(tenantId, 20);
        dashboard.put("activeTasks", toTaskViewList(activeTasks));

        List<CollaborationTask> criticalTasks = collaborationTaskMapper.findByTenantAndStatus(tenantId, "ESCALATED", 10);
        dashboard.put("escalatedTasks", toTaskViewList(criticalTasks));

        return dashboard;
    }

    public Map<String, Object> listTasks(String status, String priority, int page, int size) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        List<CollaborationTask> tasks;
        if (StringUtils.hasText(status)) {
            tasks = collaborationTaskMapper.findByTenantAndStatus(tenantId, status.toUpperCase(), size);
        } else {
            tasks = collaborationTaskMapper.findActiveByTenant(tenantId, size);
        }

        if (StringUtils.hasText(priority)) {
            tasks = tasks.stream()
                    .filter(t -> priority.equalsIgnoreCase(t.getPriority()))
                    .toList();
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tasks", toTaskViewList(tasks));
        result.put("total", tasks.size());
        result.put("page", page);
        result.put("size", size);
        return result;
    }

    public Map<String, Object> getTaskDetail(Long taskId) {
        CollaborationTask task = collaborationTaskMapper.selectById(taskId);
        if (task == null) return null;
        TenantAssert.assertTenantContext();
        if (!Objects.equals(UserContext.tenantId(), task.getTenantId())) {
            return null;
        }
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("id", task.getId());
        detail.put("orderNo", task.getOrderNo());
        detail.put("targetRole", task.getTargetRole());
        detail.put("taskStatus", task.getTaskStatus());
        detail.put("priority", task.getPriority());
        detail.put("currentStage", task.getCurrentStage());
        detail.put("nextStep", task.getNextStep());
        detail.put("assigneeName", task.getAssigneeName());
        detail.put("acceptanceCriteria", task.getAcceptanceCriteria());
        detail.put("sourceType", task.getSourceType());
        detail.put("sourceInstruction", task.getSourceInstruction());
        detail.put("instruction", task.getInstruction());
        detail.put("dueHint", task.getDueHint());
        detail.put("dueAt", task.getDueAt() != null ? task.getDueAt().toString() : null);
        detail.put("overdue", task.getOverdue());
        detail.put("escalatedAt", task.getEscalatedAt() != null ? task.getEscalatedAt().toString() : null);
        detail.put("escalatedTo", task.getEscalatedTo());
        detail.put("completionNote", task.getCompletionNote());
        detail.put("completedAt", task.getCompletedAt() != null ? task.getCompletedAt().toString() : null);
        detail.put("updatedAt", task.getUpdatedAt() != null ? task.getUpdatedAt().toString() : null);
        detail.put("createdAt", task.getCreatedAt() != null ? task.getCreatedAt().toString() : null);
        return detail;
    }

    public Map<String, Object> updateTaskStatus(Long taskId, String newStatus, String note) {
        CollaborationTask task = collaborationTaskMapper.selectById(taskId);
        if (task == null) return Map.of("success", false, "error", "任务不存在");
        TenantAssert.assertTenantContext();
        if (!Objects.equals(UserContext.tenantId(), task.getTenantId())) {
            return Map.of("success", false, "error", "无权操作该任务");
        }

        CollaborationTask.TaskStatus statusEnum;
        try {
            statusEnum = CollaborationTask.TaskStatus.valueOf(newStatus.toUpperCase());
        } catch (IllegalArgumentException e) {
            return Map.of("success", false, "error", "无效的任务状态: " + newStatus);
        }

        task.setTaskStatus(statusEnum.name());
        task.setUpdatedAt(LocalDateTime.now());

        if (statusEnum == CollaborationTask.TaskStatus.COMPLETED) {
            task.setCompletedAt(LocalDateTime.now());
            task.setCurrentStage("已完成");
            task.setNextStep("等待复核或归档");
            if (StringUtils.hasText(note)) {
                task.setCompletionNote(note);
            }
        } else if (statusEnum == CollaborationTask.TaskStatus.IN_PROGRESS) {
            task.setCurrentStage("处理中");
            task.setNextStep("等待责任人完成并回写结果");
        }

        String assignee = StringUtils.hasText(UserContext.username()) ? UserContext.username() : null;
        if (assignee != null && task.getAssigneeName() == null) {
            task.setAssigneeName(assignee);
        }

        collaborationTaskMapper.updateById(task);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("taskId", taskId);
        result.put("newStatus", statusEnum.name());
        result.put("updatedAt", task.getUpdatedAt().toString());
        return result;
    }

    public Map<String, Object> escalateTask(Long taskId, String reason) {
        CollaborationTask task = collaborationTaskMapper.selectById(taskId);
        if (task == null) return Map.of("success", false, "error", "任务不存在");

        String escalatedTo = resolveEscalationTarget(task);
        int updated = collaborationTaskMapper.escalateTask(taskId, escalatedTo);
        if (updated > 0) {
            log.info("[TaskCenter] 任务[{}]已升级至: {}", taskId, escalatedTo);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", updated > 0);
        result.put("taskId", taskId);
        result.put("escalatedTo", escalatedTo);
        result.put("reason", reason);
        return result;
    }

    private String resolveEscalationTarget(CollaborationTask task) {
        return switch (task.getTargetRole() != null ? task.getTargetRole().trim() : "") {
            case "跟单", "跟单员" -> "生产主管";
            case "采购", "采购员" -> "采购经理";
            case "财务" -> "财务主管";
            case "仓库", "仓库管理员" -> "仓库主管";
            case "质检", "质检员" -> "品质主管";
            default -> "管理员";
        };
    }

    private List<Map<String, Object>> toTaskViewList(List<CollaborationTask> tasks) {
        if (tasks == null) return Collections.emptyList();
        List<Map<String, Object>> views = new ArrayList<>();
        for (CollaborationTask t : tasks) {
            Map<String, Object> v = new LinkedHashMap<>();
            v.put("id", t.getId());
            v.put("orderNo", t.getOrderNo());
            v.put("targetRole", t.getTargetRole());
            v.put("taskStatus", t.getTaskStatus());
            v.put("priority", t.getPriority());
            v.put("currentStage", t.getCurrentStage());
            v.put("assigneeName", t.getAssigneeName());
            v.put("dueAt", t.getDueAt() != null ? t.getDueAt().toString() : null);
            v.put("overdue", t.getOverdue());
            v.put("dueHint", t.getDueHint());
            v.put("nextStep", t.getNextStep());
            v.put("updatedAt", t.getUpdatedAt() != null ? t.getUpdatedAt().toString() : null);
            views.add(v);
        }
        return views;
    }
}
