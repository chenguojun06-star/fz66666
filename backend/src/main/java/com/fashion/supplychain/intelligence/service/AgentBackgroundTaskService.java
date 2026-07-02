package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.dto.AgentBackgroundTaskDTO;
import com.fashion.supplychain.intelligence.entity.AgentBackgroundTask;
import com.fashion.supplychain.intelligence.mapper.AgentBackgroundTaskMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@Lazy
@Slf4j
@RequiredArgsConstructor
public class AgentBackgroundTaskService {

    private final AgentBackgroundTaskMapper taskMapper;
    private final ObjectMapper objectMapper;

    public String createTask(Long tenantId, String taskName, String taskType,
                             String priority, Object inputParams,
                             String createdBy, String assigneeUserId,
                             Integer timeoutSeconds, Integer maxRetry) {
        AgentBackgroundTask task = new AgentBackgroundTask();
        task.setTaskId(UUID.randomUUID().toString().replace("-", ""));
        task.setTenantId(tenantId);
        task.setTaskName(taskName);
        task.setTaskType(taskType);
        task.setStatus("PENDING");
        task.setPriority(priority != null ? priority : "MEDIUM");
        task.setCreatedBy(createdBy);
        task.setAssigneeUserId(assigneeUserId);
        task.setProgress(0);
        task.setCurrentStep("等待执行");
        task.setRetryCount(0);
        task.setMaxRetry(maxRetry != null ? maxRetry : 3);
        task.setTimeoutSeconds(timeoutSeconds != null ? timeoutSeconds : 1800);
        task.setDeleteFlag(0);

        if (inputParams != null) {
            try {
                task.setInputParamsJson(objectMapper.writeValueAsString(inputParams));
            } catch (Exception e) {
                log.warn("[BackgroundTask] 序列化输入参数失败: {}", e.getMessage());
            }
        }

        taskMapper.insert(task);
        log.info("[BackgroundTask] 创建任务: taskId={}, taskName={}, tenantId={}",
                task.getTaskId(), taskName, tenantId);
        return task.getTaskId();
    }

    public AgentBackgroundTask getByTaskId(String taskId) {
        return taskMapper.selectByTaskId(taskId);
    }

    public List<AgentBackgroundTaskDTO> getActiveTasks(Long tenantId, int limit) {
        List<AgentBackgroundTask> tasks = taskMapper.selectActiveTasks(tenantId, limit);
        return convertToDTO(tasks);
    }

    public List<AgentBackgroundTaskDTO> getTaskList(Long tenantId, int pageNum, int pageSize) {
        int offset = (pageNum - 1) * pageSize;
        List<AgentBackgroundTask> tasks = taskMapper.selectTaskList(tenantId, offset, pageSize);
        return convertToDTO(tasks);
    }

    public int countTasks(Long tenantId) {
        return taskMapper.countByTenant(tenantId);
    }

    public boolean updateProgress(String taskId, int progress, String currentStep) {
        int rows = taskMapper.updateProgress(taskId, progress, currentStep);
        return rows > 0;
    }

    public boolean markAsCompleted(String taskId, Object result) {
        String resultJson = null;
        if (result != null) {
            try {
                resultJson = objectMapper.writeValueAsString(result);
            } catch (Exception e) {
                log.warn("[BackgroundTask] 序列化结果失败: {}", e.getMessage());
            }
        }
        int rows = taskMapper.markAsCompleted(taskId, resultJson);
        if (rows > 0) {
            log.info("[BackgroundTask] 任务完成: taskId={}", taskId);
            return true;
        }
        return false;
    }

    public boolean markAsFailed(String taskId, String errorMessage) {
        int rows = taskMapper.markAsFailed(taskId, errorMessage);
        if (rows > 0) {
            log.warn("[BackgroundTask] 任务失败: taskId={}, error={}", taskId, errorMessage);
            return true;
        }
        return false;
    }

    public boolean cancelTask(String taskId) {
        AgentBackgroundTask task = taskMapper.selectByTaskId(taskId);
        if (task == null) {
            return false;
        }
        if ("COMPLETED".equals(task.getStatus()) || "FAILED".equals(task.getStatus()) || "CANCELLED".equals(task.getStatus())) {
            return true;
        }
        int rows = taskMapper.update(null, new LambdaUpdateWrapper<AgentBackgroundTask>()
                .eq(AgentBackgroundTask::getTaskId, taskId)
                .set(AgentBackgroundTask::getStatus, "CANCELLED")
                .set(AgentBackgroundTask::getCompletedAt, LocalDateTime.now())
                .set(AgentBackgroundTask::getCurrentStep, "已取消"));
        return rows > 0;
    }

    public List<AgentBackgroundTask> getPendingTasks(Long tenantId, int limit) {
        return taskMapper.selectPendingTasks(tenantId, limit);
    }

    public int countRunningTasks(Long tenantId) {
        return taskMapper.countRunningTasks(tenantId);
    }

    public boolean tryClaimTask(String taskId) {
        int rows = taskMapper.markAsRunning(taskId);
        return rows > 0;
    }

    public <T> T parseInputParams(String taskId, Class<T> clazz) {
        AgentBackgroundTask task = taskMapper.selectByTaskId(taskId);
        if (task == null || task.getInputParamsJson() == null) {
            return null;
        }
        try {
            return objectMapper.readValue(task.getInputParamsJson(), clazz);
        } catch (Exception e) {
            log.warn("[BackgroundTask] 解析输入参数失败: {}", e.getMessage());
            return null;
        }
    }

    private List<AgentBackgroundTaskDTO> convertToDTO(List<AgentBackgroundTask> tasks) {
        List<AgentBackgroundTaskDTO> dtoList = new ArrayList<>();
        for (AgentBackgroundTask task : tasks) {
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
            dtoList.add(dto);
        }
        return dtoList;
    }
}
