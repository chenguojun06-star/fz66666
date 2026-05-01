package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.CollaborationDispatchRequest;
import com.fashion.supplychain.intelligence.dto.CollaborationDispatchResponse;
import com.fashion.supplychain.intelligence.entity.CollaborationTask;
import com.fashion.supplychain.intelligence.mapper.CollaborationTaskMapper;
import com.fashion.supplychain.service.RedisService;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Slf4j
@Service
public class CollaborationTaskLifecycleOrchestrator {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Autowired private CollaborationTaskMapper collaborationTaskMapper;
    @Autowired private RedisService redisService;

    public void initialize(CollaborationDispatchRequest request, CollaborationDispatchResponse response) {
        if (response == null || !response.isSuccess()) return;
        TaskState state = new TaskState();
        state.setResponse(response);
        LocalDateTime now = LocalDateTime.now();
        state.setUpdatedAt(now);
        LocalDateTime dueAt = resolveDueAt(now, response.getDueHint());
        state.setDueAt(dueAt);
        appendHistory(response, "dispatch", UserContext.username(), response.getCurrentStage(), request.getInstruction());
        applyTiming(state);
        String key = resolveKey(request.getOrderNo(), response.getOwnerRole());
        saveToDb(request.getOrderNo(), response.getOwnerRole(), state);
        saveToRedis(key, state);
        addToIndex(key);
    }

    public CollaborationDispatchResponse query(String orderNo, String targetRole) {
        TaskState state = loadFromDb(orderNo, targetRole);
        if (state == null) {
            state = loadFromRedis(resolveKey(orderNo, targetRole));
        }
        if (state == null) return null;
        applyTiming(state);
        String key = resolveKey(orderNo, targetRole);
        saveToRedis(key, state);
        return state.getResponse();
    }

    public CollaborationDispatchResponse update(String orderNo, String targetRole, String targetUser, String action, String remark) {
        TaskState state = loadFromDb(orderNo, targetRole);
        if (state == null) {
            state = loadFromRedis(resolveKey(orderNo, targetRole));
        }
        if (state == null || state.getResponse() == null) return null;
        String actor = StringUtils.hasText(targetUser) ? targetUser.trim() : UserContext.username();
        List<CollaborationDispatchResponse.Recipient> recipients = state.getResponse().getRecipients();
        boolean matched = false;
        for (CollaborationDispatchResponse.Recipient recipient : recipients) {
            if (!matches(recipient, actor, targetUser)) continue;
            applyRecipientAction(recipient, action, remark);
            matched = true;
        }
        if (!matched && !recipients.isEmpty()) {
            applyRecipientAction(recipients.get(0), action, remark);
        }
        state.setUpdatedAt(LocalDateTime.now());
        recomputeState(state);
        appendHistory(state.getResponse(), action, actor, state.getResponse().getCurrentStage(), remark);
        applyTiming(state);
        String key = resolveKey(orderNo, targetRole);
        saveToDb(orderNo, targetRole, state);
        saveToRedis(key, state);
        addToIndex(key);
        return state.getResponse();
    }

    public List<CollaborationDispatchResponse> listTasks(String orderNo, String targetRole, int limit) {
        Long tenantId = UserContext.tenantId();
        List<CollaborationTask> tasks;
        if (StringUtils.hasText(orderNo) && StringUtils.hasText(targetRole)) {
            CollaborationTask single = collaborationTaskMapper.findByTenantAndOrderAndRole(tenantId, orderNo.trim(), targetRole.trim());
            tasks = single != null ? List.of(single) : List.of();
        } else if (StringUtils.hasText(orderNo)) {
            tasks = collaborationTaskMapper.findByTenantAndOrder(tenantId, orderNo.trim(), Math.max(limit, 50));
        } else {
            tasks = collaborationTaskMapper.findRecentByTenant(tenantId, Math.max(limit, 50));
        }
        List<CollaborationDispatchResponse> result = new ArrayList<>();
        for (CollaborationTask task : tasks) {
            TaskState state = deserializeTaskState(task);
            if (state == null || state.getResponse() == null) continue;
            if (StringUtils.hasText(targetRole) && !targetRole.trim().equalsIgnoreCase(nullSafe(state.getResponse().getOwnerRole()))) continue;
            applyTiming(state);
            result.add(state.getResponse());
            if (result.size() >= Math.max(limit, 1)) break;
        }
        return result;
    }

    private void applyRecipientAction(CollaborationDispatchResponse.Recipient recipient, String action, String remark) {
        String now = FMT.format(LocalDateTime.now());
        recipient.setUpdatedAt(now);
        if ("accept_task".equalsIgnoreCase(action)) {
            recipient.setDispatchStatus("已接收");
            recipient.setProcessingStage("待处理");
            recipient.setNextAction(StringUtils.hasText(remark) ? remark : "开始处理并回写进度");
            return;
        }
        if ("start_task".equalsIgnoreCase(action)) {
            recipient.setDispatchStatus("已接收");
            recipient.setProcessingStage("处理中");
            recipient.setNextAction(StringUtils.hasText(remark) ? remark : "继续处理并在完成后回写结果");
            return;
        }
        if ("complete_task".equalsIgnoreCase(action)) {
            recipient.setDispatchStatus("已完成");
            recipient.setProcessingStage("已完成");
            recipient.setNextAction(StringUtils.hasText(remark) ? remark : "任务已完成，等待复核");
        }
    }

    private void recomputeState(TaskState state) {
        CollaborationDispatchResponse response = state.getResponse();
        long completed = response.getRecipients().stream().filter(r -> "已完成".equals(r.getProcessingStage())).count();
        long processing = response.getRecipients().stream().filter(r -> "处理中".equals(r.getProcessingStage())).count();
        long accepted = response.getRecipients().stream().filter(r -> "已接收".equals(r.getDispatchStatus())).count();
        if (completed == response.getRecipients().size() && completed > 0) {
            response.setCurrentStage("已完成");
            response.setNextStep("等待复核或归档");
        } else if (processing > 0) {
            response.setCurrentStage("处理中");
            response.setNextStep("等待责任人完成并回写结果");
        } else if (accepted > 0) {
            response.setCurrentStage("已接收");
            response.setNextStep("等待责任人开始处理");
        } else {
            response.setCurrentStage("已通知");
            response.setNextStep("等待责任人接收");
        }
    }

    private void applyTiming(TaskState state) {
        CollaborationDispatchResponse response = state.getResponse();
        response.setUpdatedAt(format(state.getUpdatedAt()));
        response.setDueAt(format(state.getDueAt()));
        boolean overdue = state.getDueAt() != null
                && state.getDueAt().isBefore(LocalDateTime.now())
                && !"已完成".equals(response.getCurrentStage());
        response.setOverdue(overdue);
        if (overdue) {
            response.setCurrentStage("已超时");
            response.setNextStep("建议立即催办或升级处理");
            for (CollaborationDispatchResponse.Recipient recipient : response.getRecipients()) {
                if (!"已完成".equals(recipient.getProcessingStage())) {
                    recipient.setNextAction("已超时，请立即处理并回写结果");
                }
            }
        }
    }

    private void appendHistory(CollaborationDispatchResponse response, String action, String actor, String stage, String remark) {
        if (response.getHistory() == null) {
            response.setHistory(new ArrayList<>());
        }
        CollaborationDispatchResponse.HistoryEntry entry = new CollaborationDispatchResponse.HistoryEntry();
        entry.setAction(action);
        entry.setActor(actor);
        entry.setStage(stage);
        entry.setRemark(remark);
        entry.setCreatedAt(format(LocalDateTime.now()));
        response.getHistory().add(0, entry);
        if (response.getHistory().size() > 20) {
            response.setHistory(new ArrayList<>(response.getHistory().subList(0, 20)));
        }
    }

    private LocalDateTime resolveDueAt(LocalDateTime now, String dueHint) {
        String text = dueHint == null ? "" : dueHint.toLowerCase(Locale.ROOT);
        if (text.contains("1小时")) return now.plusHours(1);
        if (text.contains("2小时")) return now.plusHours(2);
        if (text.contains("今日")) return now.withHour(18).withMinute(0).withSecond(0).withNano(0);
        return now.plusHours(4);
    }

    private boolean matches(CollaborationDispatchResponse.Recipient recipient, String actor, String targetUser) {
        if (!StringUtils.hasText(actor)) return !StringUtils.hasText(targetUser);
        return actor.equalsIgnoreCase(nullSafe(recipient.getUsername()))
                || actor.equalsIgnoreCase(nullSafe(recipient.getName()))
                || actor.equalsIgnoreCase(nullSafe(recipient.getDisplayName()));
    }

    private String resolveKey(String orderNo, String targetRole) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String normalizedOrder = StringUtils.hasText(orderNo) ? orderNo.trim() : "general";
        String normalizedRole = StringUtils.hasText(targetRole) ? targetRole.trim() : "general";
        return "collab:lifecycle:" + tenantId + ":" + normalizedOrder + ":" + normalizedRole;
    }

    private void saveToDb(String orderNo, String targetRole, TaskState state) {
        try {
            Long tenantId = UserContext.tenantId();
            CollaborationTask existing = collaborationTaskMapper.findByTenantAndOrderAndRole(
                    tenantId,
                    StringUtils.hasText(orderNo) ? orderNo.trim() : "general",
                    StringUtils.hasText(targetRole) ? targetRole.trim() : "general"
            );
            String json = MAPPER.writeValueAsString(state);
            String currentStage = state.getResponse().getCurrentStage();
            boolean isCompleted = "已完成".equals(currentStage);
            if (existing != null) {
                existing.setDispatchResponseJson(json);
                existing.setCurrentStage(currentStage);
                existing.setNextStep(state.getResponse().getNextStep());
                existing.setUpdatedAt(state.getUpdatedAt());
                existing.setDueAt(state.getDueAt());
                existing.setOverdue(state.getDueAt() != null && state.getDueAt().isBefore(LocalDateTime.now()));
                if (isCompleted) {
                    existing.setTaskStatus("COMPLETED");
                    existing.setCompletedAt(LocalDateTime.now());
                    if (state.getResponse().getHistory() != null && !state.getResponse().getHistory().isEmpty()) {
                        CollaborationDispatchResponse.HistoryEntry last = state.getResponse().getHistory().get(0);
                        if ("complete_task".equals(last.getAction()) && StringUtils.hasText(last.getRemark())) {
                            existing.setCompletionNote(last.getRemark());
                        }
                    }
                } else if (existing.getTaskStatus() == null || "PENDING".equals(existing.getTaskStatus())) {
                    existing.setTaskStatus("IN_PROGRESS");
                }
                collaborationTaskMapper.updateById(existing);
            } else {
                CollaborationTask task = new CollaborationTask();
                task.setTenantId(tenantId);
                task.setOrderNo(StringUtils.hasText(orderNo) ? orderNo.trim() : "general");
                task.setTargetRole(StringUtils.hasText(targetRole) ? targetRole.trim() : "general");
                task.setCurrentStage(currentStage);
                task.setNextStep(state.getResponse().getNextStep());
                task.setInstruction(null);
                task.setDueHint(state.getResponse().getDueHint());
                task.setDispatchResponseJson(json);
                task.setUpdatedAt(state.getUpdatedAt());
                task.setDueAt(state.getDueAt());
                task.setOverdue(false);
                task.setTaskStatus("PENDING");
                collaborationTaskMapper.insert(task);
            }
        } catch (Exception e) {
            log.warn("[CollaborationTask] saveToDb failed: {}", e.getMessage());
        }
    }

    private void saveToRedis(String key, TaskState state) {
        try {
            redisService.set(key, MAPPER.writeValueAsString(state), 7, TimeUnit.DAYS);
        } catch (Exception e) {
            log.debug("Non-critical Redis write error: {}", e.getMessage());
        }
    }

    private void addToIndex(String taskKey) {
        try {
            List<String> keys = loadIndex();
            keys.removeIf(existing -> existing.equals(taskKey));
            keys.add(0, taskKey);
            if (keys.size() > 200) {
                keys = new ArrayList<>(keys.subList(0, 200));
            }
            redisService.set(resolveIndexKey(), MAPPER.writeValueAsString(keys), 7, TimeUnit.DAYS);
        } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
    }

    private TaskState loadFromDb(String orderNo, String targetRole) {
        try {
            Long tenantId = UserContext.tenantId();
            CollaborationTask task = collaborationTaskMapper.findByTenantAndOrderAndRole(
                    tenantId,
                    StringUtils.hasText(orderNo) ? orderNo.trim() : "general",
                    StringUtils.hasText(targetRole) ? targetRole.trim() : "general"
            );
            return deserializeTaskState(task);
        } catch (Exception e) {
            log.debug("[CollaborationTask] loadFromDb failed: {}", e.getMessage());
            return null;
        }
    }

    private TaskState loadFromRedis(String key) {
        try {
            String value = redisService.get(key);
            if (!StringUtils.hasText(value)) return null;
            return MAPPER.readValue(value, TaskState.class);
        } catch (Exception e) {
            log.debug("[CollaborationTask] loadFromRedis failed: key={}", key);
            return null;
        }
    }

    private TaskState deserializeTaskState(CollaborationTask task) {
        if (task == null || !StringUtils.hasText(task.getDispatchResponseJson())) return null;
        try {
            return MAPPER.readValue(task.getDispatchResponseJson(), TaskState.class);
        } catch (Exception e) {
            log.warn("[CollaborationTask] deserialize failed: id={}", task.getId());
            return null;
        }
    }

    private List<String> loadIndex() {
        try {
            String value = redisService.get(resolveIndexKey());
            if (!StringUtils.hasText(value)) return new ArrayList<>();
            return MAPPER.readValue(value, MAPPER.getTypeFactory().constructCollectionType(List.class, String.class));
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    private String format(LocalDateTime time) {
        return time == null ? null : FMT.format(time);
    }

    private String resolveIndexKey() {
        return "collab:lifecycle:index:" + UserContext.tenantId();
    }

    private String nullSafe(String value) {
        return value == null ? "" : value.trim();
    }

    @Data
    public static class TaskState {
        private CollaborationDispatchResponse response;
        private LocalDateTime updatedAt;
        private LocalDateTime dueAt;
    }
}
