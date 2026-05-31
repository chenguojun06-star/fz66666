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
    private final TaskOrderMonitorOrchestrator taskOrderMonitorOrchestrator;

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
        detail.put("styleNo", task.getStyleNo());
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
        detail.put("orderLinkStatus", task.getOrderLinkStatus());
        detail.put("progressChangeMonitorEnabled", task.getProgressChangeMonitorEnabled());
        detail.put("lastReminderSentAt", task.getLastReminderSentAt() != null ? task.getLastReminderSentAt().toString() : null);
        detail.put("reminderCount", task.getReminderCount());
        detail.put("lastOrderProgress", task.getLastOrderProgress());
        detail.put("lastOrderStatus", task.getLastOrderStatus());
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
            task.setNextStep("等待领取人完成并回写结果");
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

    public Map<String, Object> createTask(Map<String, Object> taskData) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId() != null ? String.valueOf(UserContext.userId()) : null;
        String username = StringUtils.hasText(UserContext.username()) ? UserContext.username() : null;

        String title = String.valueOf(taskData.getOrDefault("title", ""));
        if (!StringUtils.hasText(title)) {
            return Map.of("success", false, "error", "任务标题不能为空");
        }
        String description = String.valueOf(taskData.getOrDefault("description", ""));
        String priority = String.valueOf(taskData.getOrDefault("priority", "medium")).toUpperCase();
        String module = String.valueOf(taskData.getOrDefault("module", ""));
        String orderNo = String.valueOf(taskData.getOrDefault("orderNo", ""));
        String styleNo = String.valueOf(taskData.getOrDefault("styleNo", ""));
        String dueAtStr = String.valueOf(taskData.getOrDefault("endTime", ""));

        CollaborationTask task = new CollaborationTask();
        task.setTenantId(tenantId);
        task.setInstruction(title);
        task.setSourceInstruction(description);
        task.setTargetRole(module);
        task.setPriority(priority);
        task.setTaskStatus(CollaborationTask.TaskStatus.PENDING.name());
        task.setSourceType(CollaborationTask.SourceType.MANUAL.name());
        task.setCurrentStage("待处理");
        task.setNextStep("分配给对应领取人处理");
        task.setAcceptanceCriteria(description);
        task.setOverdue(false);
        task.setCreatedAt(LocalDateTime.now());
        task.setUpdatedAt(LocalDateTime.now());
        task.setOrderLinkStatus(TaskOrderMonitorOrchestrator.OrderLinkStatus.NOT_LINKED);
        task.setProgressChangeMonitorEnabled(true);
        task.setReminderCount(0);

        if (StringUtils.hasText(orderNo)) {
            task.setOrderNo(orderNo);
        }
        if (StringUtils.hasText(styleNo)) {
            task.setStyleNo(styleNo);
        }
        if (StringUtils.hasText(dueAtStr)) {
            try {
                task.setDueAt(LocalDateTime.parse(dueAtStr + "T23:59:59"));
            } catch (Exception e) {
                log.warn("[TaskCenter] 截止日期解析失败: {}", dueAtStr);
            }
        }
        collaborationTaskMapper.insert(task);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("taskId", task.getId());
        result.put("title", title);
        result.put("createdAt", task.getCreatedAt().toString());

        if (StringUtils.hasText(orderNo)) {
            Map<String, Object> linkResult = taskOrderMonitorOrchestrator.linkTaskToOrder(task.getId(), orderNo);
            result.put("orderLink", linkResult);
        }

        return result;
    }

    public Map<String, Object> updateTask(Long taskId, Map<String, Object> taskData) {
        CollaborationTask task = collaborationTaskMapper.selectById(taskId);
        if (task == null) return Map.of("success", false, "error", "任务不存在");
        TenantAssert.assertTenantContext();
        if (!Objects.equals(UserContext.tenantId(), task.getTenantId())) {
            return Map.of("success", false, "error", "无权操作该任务");
        }

        if (taskData.containsKey("title")) {
            task.setInstruction(String.valueOf(taskData.get("title")));
        }
        if (taskData.containsKey("description")) {
            String desc = String.valueOf(taskData.get("description"));
            task.setSourceInstruction(desc);
            task.setAcceptanceCriteria(desc);
        }
        if (taskData.containsKey("priority")) {
            task.setPriority(String.valueOf(taskData.get("priority")).toUpperCase());
        }
        if (taskData.containsKey("module")) {
            task.setTargetRole(String.valueOf(taskData.get("module")));
        }
        if (taskData.containsKey("endTime")) {
            String dueStr = String.valueOf(taskData.get("endTime"));
            if (StringUtils.hasText(dueStr)) {
                try {
                    task.setDueAt(LocalDateTime.parse(dueStr + "T23:59:59"));
                } catch (Exception e) {
                    log.warn("[TaskCenter] 截止日期解析失败: {}", dueStr);
                }
            }
        }
        task.setUpdatedAt(LocalDateTime.now());
        collaborationTaskMapper.updateById(task);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("taskId", taskId);
        result.put("updatedAt", task.getUpdatedAt().toString());
        return result;
    }

    public Map<String, Object> deleteTask(Long taskId) {
        CollaborationTask task = collaborationTaskMapper.selectById(taskId);
        if (task == null) return Map.of("success", false, "error", "任务不存在");
        TenantAssert.assertTenantContext();
        if (!Objects.equals(UserContext.tenantId(), task.getTenantId())) {
            return Map.of("success", false, "error", "无权操作该任务");
        }

        task.setTaskStatus(CollaborationTask.TaskStatus.CANCELLED.name());
        task.setUpdatedAt(LocalDateTime.now());
        collaborationTaskMapper.updateById(task);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("taskId", taskId);
        return result;
    }

    public Map<String, Object> claimTask(Long taskId) {
        CollaborationTask task = collaborationTaskMapper.selectById(taskId);
        if (task == null) return Map.of("success", false, "error", "任务不存在");
        TenantAssert.assertTenantContext();
        if (!Objects.equals(UserContext.tenantId(), task.getTenantId())) {
            return Map.of("success", false, "error", "无权操作该任务");
        }

        String username = StringUtils.hasText(UserContext.username()) ? UserContext.username() : null;
        if (username == null) {
            return Map.of("success", false, "error", "无法获取当前用户信息");
        }

        task.setAssigneeName(username);
        task.setTaskStatus(CollaborationTask.TaskStatus.IN_PROGRESS.name());
        task.setCurrentStage("处理中");
        task.setNextStep("等待领取人完成并回写结果");
        task.setUpdatedAt(LocalDateTime.now());
        collaborationTaskMapper.updateById(task);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("taskId", taskId);
        result.put("assigneeName", username);
        result.put("newStatus", task.getTaskStatus());
        return result;
    }

    public Map<String, Object> getMyTasks(String status, String priority, String module, int page, int size) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String username = StringUtils.hasText(UserContext.username()) ? UserContext.username() : null;

        List<CollaborationTask> all = collaborationTaskMapper.findActiveByTenant(tenantId, 200);
        List<CollaborationTask> filtered = new ArrayList<>();

        for (CollaborationTask t : all) {
            boolean isMine = username != null && username.equals(t.getAssigneeName());
            boolean isManual = CollaborationTask.SourceType.MANUAL.name().equals(t.getSourceType());
            if (!isMine && !isManual) continue;
            if ("CANCELLED".equals(t.getTaskStatus())) continue;
            filtered.add(t);
        }

        if (StringUtils.hasText(status)) {
            filtered = filtered.stream()
                    .filter(t -> status.equalsIgnoreCase(t.getTaskStatus()))
                    .toList();
        }
        if (StringUtils.hasText(priority)) {
            filtered = filtered.stream()
                    .filter(t -> priority.equalsIgnoreCase(t.getPriority()))
                    .toList();
        }
        if (StringUtils.hasText(module)) {
            filtered = filtered.stream()
                    .filter(t -> module.equalsIgnoreCase(t.getTargetRole()))
                    .toList();
        }

        filtered.sort((a, b) -> {
            LocalDateTime da = a.getCreatedAt();
            LocalDateTime db = b.getCreatedAt();
            if (da == null && db == null) return 0;
            if (da == null) return 1;
            if (db == null) return -1;
            return db.compareTo(da);
        });

        int from = (page - 1) * size;
        int to = Math.min(from + size, filtered.size());
        List<CollaborationTask> paged = filtered.subList(Math.min(from, filtered.size()), to);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", toPersonalTaskViewList(paged));
        result.put("total", filtered.size());
        return result;
    }

    public Map<String, Object> getTaskStats() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String username = StringUtils.hasText(UserContext.username()) ? UserContext.username() : null;

        List<CollaborationTask> all = collaborationTaskMapper.findActiveByTenant(tenantId, 500);
        int pending = 0, inProgress = 0, completed = 0, highPriority = 0;

        for (CollaborationTask t : all) {
            boolean isMine = username != null && username.equals(t.getAssigneeName());
            boolean isManual = CollaborationTask.SourceType.MANUAL.name().equals(t.getSourceType());
            if (!isMine && !isManual) continue;

            String s = t.getTaskStatus();
            if ("PENDING".equals(s)) pending++;
            else if ("IN_PROGRESS".equals(s) || "ACCEPTED".equals(s)) inProgress++;
            else if ("COMPLETED".equals(s)) completed++;
            if ("HIGH".equals(t.getPriority()) || "CRITICAL".equals(t.getPriority())) highPriority++;
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("pendingCount", pending);
        result.put("inProgressCount", inProgress);
        result.put("completedCount", completed);
        result.put("totalCount", pending + inProgress + completed);
        result.put("highPriorityCount", highPriority);
        return result;
    }

    private List<Map<String, Object>> toPersonalTaskViewList(List<CollaborationTask> tasks) {
        if (tasks == null) return Collections.emptyList();
        List<Map<String, Object>> views = new ArrayList<>();
        for (CollaborationTask t : tasks) {
            Map<String, Object> v = new LinkedHashMap<>();
            v.put("id", String.valueOf(t.getId()));
            v.put("title", t.getInstruction());
            v.put("description", t.getSourceInstruction() != null ? t.getSourceInstruction() : "");
            v.put("module", t.getTargetRole() != null ? t.getTargetRole() : "");
            v.put("taskType", t.getSourceType());
            v.put("priority", t.getPriority() != null ? t.getPriority().toLowerCase() : "medium");
            v.put("status", t.getTaskStatus() != null ? t.getTaskStatus().toLowerCase() : "pending");
            v.put("assigneeName", t.getAssigneeName());
            v.put("orderNo", t.getOrderNo());
            v.put("styleNo", "");
            v.put("deepLinkPath", "");
            v.put("endTime", t.getDueAt() != null ? t.getDueAt().toString() : null);
            v.put("createdAt", t.getCreatedAt() != null ? t.getCreatedAt().toString() : null);
            v.put("updatedAt", t.getUpdatedAt() != null ? t.getUpdatedAt().toString() : null);
            views.add(v);
        }
        return views;
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
