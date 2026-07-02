package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.AgentBackgroundTaskDTO;
import com.fashion.supplychain.intelligence.entity.AgentBackgroundTask;
import com.fashion.supplychain.intelligence.service.AgentBackgroundTaskService;
import com.fashion.supplychain.production.orchestration.SysNoticeOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Lazy
@Slf4j
@RequiredArgsConstructor
public class AgentBackgroundTaskOrchestrator {

    private final AgentBackgroundTaskService taskService;
    private final SysNoticeOrchestrator sysNoticeOrchestrator;

    @Transactional(rollbackFor = Exception.class)
    public String createTask(String taskName, String taskType, String priority,
                             Object inputParams, String assigneeUserId,
                             Integer timeoutSeconds, Integer maxRetry) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String createdBy = UserContext.userId();

        String taskId = taskService.createTask(
                tenantId, taskName, taskType, priority, inputParams,
                createdBy, assigneeUserId, timeoutSeconds, maxRetry
        );

        log.info("[BackgroundTask] 任务创建成功: taskId={}, taskName={}, tenantId={}",
                taskId, taskName, tenantId);
        return taskId;
    }

    public AgentBackgroundTaskDTO getTaskDetail(String taskId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        AgentBackgroundTask task = taskService.getByTaskId(taskId);
        if (task == null || !task.getTenantId().equals(tenantId)) {
            return null;
        }

        AgentBackgroundTaskDTO dto = new AgentBackgroundTaskDTO();
        dto.setTaskId(task.getTaskId());
        dto.setTaskName(task.getTaskName());
        dto.setTaskType(task.getTaskType());
        dto.setStatus(task.getStatus());
        dto.setPriority(task.getPriority());
        dto.setCreatedBy(task.getCreatedBy());
        dto.setProgress(task.getProgress());
        dto.setCurrentStep(task.getCurrentStep());
        dto.setRetryCount(task.getRetryCount());
        dto.setMaxRetry(task.getMaxRetry());
        dto.setStartedAt(task.getStartedAt());
        dto.setCompletedAt(task.getCompletedAt());
        dto.setTimeoutSeconds(task.getTimeoutSeconds());
        dto.setErrorMessage(task.getErrorMessage());
        dto.setCreateTime(task.getCreateTime());
        dto.setUpdateTime(task.getUpdateTime());
        return dto;
    }

    public List<AgentBackgroundTaskDTO> getActiveTasks(int limit) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        return taskService.getActiveTasks(tenantId, limit);
    }

    public Map<String, Object> getTaskList(int pageNum, int pageSize) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        List<AgentBackgroundTaskDTO> list = taskService.getTaskList(tenantId, pageNum, pageSize);
        int total = taskService.countTasks(tenantId);

        Map<String, Object> result = new HashMap<>();
        result.put("list", list);
        result.put("total", total);
        result.put("pageNum", pageNum);
        result.put("pageSize", pageSize);
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean cancelTask(String taskId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        AgentBackgroundTask task = taskService.getByTaskId(taskId);
        if (task == null || !task.getTenantId().equals(tenantId)) {
            return false;
        }

        return taskService.cancelTask(taskId);
    }

    public void notifyTaskComplete(String taskId, String taskName, String status,
                                   String assigneeUserId, Long tenantId) {
        try {
            if (assigneeUserId == null) {
                return;
            }
            String title = "COMPLETED".equals(status) ? "任务完成：" + taskName : "任务失败：" + taskName;
            String content = "COMPLETED".equals(status)
                    ? "后台任务「" + taskName + "」已完成，请查看结果。"
                    : "后台任务「" + taskName + "」执行失败，请查看详情。";

            log.info("[BackgroundTask] 任务完成通知: taskId={}, assignee={}, status={}",
                    taskId, assigneeUserId, status);
        } catch (Exception e) {
            log.warn("[BackgroundTask] 发送通知失败: taskId={}, error={}", taskId, e.getMessage());
        }
    }
}
