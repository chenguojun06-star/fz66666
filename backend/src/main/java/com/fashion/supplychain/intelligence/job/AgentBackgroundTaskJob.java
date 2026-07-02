package com.fashion.supplychain.intelligence.job;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.lock.DistributedLockService;
import com.fashion.supplychain.intelligence.entity.AgentBackgroundTask;
import com.fashion.supplychain.intelligence.orchestration.AgentBackgroundTaskOrchestrator;
import com.fashion.supplychain.intelligence.service.AgentBackgroundTaskService;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
@Lazy
public class AgentBackgroundTaskJob {

    @Autowired
    private AgentBackgroundTaskService taskService;

    @Autowired
    private AgentBackgroundTaskOrchestrator taskOrchestrator;

    @Autowired
    private DistributedLockService distributedLockService;

    @Autowired
    private ProcessStatsEngine processStatsEngine;

    private static final int MAX_CONCURRENT_PER_TENANT = 2;
    private static final int TASK_BATCH_SIZE = 10;
    private static final String LOCK_KEY = "job:agent-background-task";
    private static final long LOCK_TIMEOUT_MINUTES = 10;

    private final Map<Long, Semaphore> tenantSemaphores = new ConcurrentHashMap<>();
    private final ExecutorService taskExecutor = Executors.newCachedThreadPool();
    private final Map<String, BackgroundTaskExecutor> executors = new ConcurrentHashMap<>();

    public interface BackgroundTaskExecutor {
        Object execute(AgentBackgroundTask task) throws Exception;
    }

    public void registerExecutor(String taskType, BackgroundTaskExecutor executor) {
        executors.put(taskType, executor);
        log.info("[BackgroundTaskJob] 注册任务执行器: taskType={}", taskType);
    }

    @Scheduled(fixedDelay = 10000)
    public void processPendingTasks() {
        String lockValue = distributedLockService.tryLock(LOCK_KEY, LOCK_TIMEOUT_MINUTES, TimeUnit.MINUTES);
        if (lockValue == null) {
            return;
        }
        try {
            List<Long> tenantIds = getActiveTenantIds();
            for (Long tenantId : tenantIds) {
                try {
                    processTenantTasks(tenantId);
                } catch (Exception e) {
                    log.warn("[BackgroundTaskJob] 处理租户任务异常: tenantId={}, error={}",
                            tenantId, e.getMessage());
                }
            }
        } finally {
            distributedLockService.unlock(LOCK_KEY, lockValue);
        }
    }

    private List<Long> getActiveTenantIds() {
        try {
            return processStatsEngine.findActiveTenantIds();
        } catch (Exception e) {
            log.warn("[BackgroundTaskJob] 获取活跃租户列表失败: {}", e.getMessage());
            return List.of();
        }
    }

    private void processTenantTasks(Long tenantId) {
        Semaphore semaphore = tenantSemaphores.computeIfAbsent(tenantId,
                k -> new Semaphore(MAX_CONCURRENT_PER_TENANT));

        int runningCount = taskService.countRunningTasks(tenantId);
        int availablePermits = Math.max(0, MAX_CONCURRENT_PER_TENANT - runningCount);

        if (availablePermits <= 0) {
            return;
        }

        UserContext ctx = new UserContext();
        ctx.setTenantId(tenantId);
        ctx.setUserId("SYSTEM_JOB");
        ctx.setUsername("后台任务调度器");
        UserContext.set(ctx);

        try {
            List<AgentBackgroundTask> pendingTasks = taskService.getPendingTasks(tenantId, TASK_BATCH_SIZE);
            for (AgentBackgroundTask task : pendingTasks) {
                if (semaphore.availablePermits() <= 0) {
                    break;
                }
                if (taskService.tryClaimTask(task.getTaskId())) {
                    semaphore.acquire();
                    taskExecutor.submit(() -> {
                        try {
                            executeTask(task, tenantId);
                        } finally {
                            semaphore.release();
                        }
                    });
                }
            }
        } catch (Exception e) {
            log.warn("[BackgroundTaskJob] 处理任务异常: tenantId={}, error={}", tenantId, e.getMessage());
        } finally {
            UserContext.clear();
        }
    }

    private void executeTask(AgentBackgroundTask task, Long tenantId) {
        UserContext ctx = new UserContext();
        ctx.setTenantId(tenantId);
        ctx.setUserId("SYSTEM_JOB");
        ctx.setUsername("后台任务执行器");
        UserContext.set(ctx);

        long startTime = System.currentTimeMillis();
        try {
            log.info("[BackgroundTaskJob] 开始执行任务: taskId={}, taskName={}, taskType={}",
                    task.getTaskId(), task.getTaskName(), task.getTaskType());

            taskService.updateProgress(task.getTaskId(), 5, "正在执行...");

            BackgroundTaskExecutor executor = executors.get(task.getTaskType());
            Object result;
            if (executor != null) {
                result = executor.execute(task);
            } else {
                result = executeDefaultTask(task);
            }

            taskService.markAsCompleted(task.getTaskId(), result);
            taskOrchestrator.notifyTaskComplete(
                    task.getTaskId(), task.getTaskName(),
                    "COMPLETED", task.getAssigneeUserId(), tenantId
            );

            long elapsed = System.currentTimeMillis() - startTime;
            log.info("[BackgroundTaskJob] 任务完成: taskId={}, taskName={}, 耗时={}ms",
                    task.getTaskId(), task.getTaskName(), elapsed);

        } catch (Exception e) {
            log.error("[BackgroundTaskJob] 任务执行失败: taskId={}, taskName={}, error={}",
                    task.getTaskId(), task.getTaskName(), e.getMessage(), e);

            if (task.getRetryCount() < task.getMaxRetry()) {
                retryTask(task, e.getMessage());
            } else {
                taskService.markAsFailed(task.getTaskId(), e.getMessage());
                taskOrchestrator.notifyTaskComplete(
                        task.getTaskId(), task.getTaskName(),
                        "FAILED", task.getAssigneeUserId(), tenantId
                );
            }
        } finally {
            UserContext.clear();
        }
    }

    private void retryTask(AgentBackgroundTask task, String errorMessage) {
        try {
            int nextRetryCount = task.getRetryCount() + 1;
            long delaySeconds = (long) Math.pow(2, nextRetryCount) * 30;

            taskService.updateProgress(task.getTaskId(), task.getProgress(),
                    "执行失败，第" + nextRetryCount + "次重试中... (" + errorMessage + ")");

            log.info("[BackgroundTaskJob] 任务重试: taskId={}, retryCount={}, delay={}s",
                    task.getTaskId(), nextRetryCount, delaySeconds);

        } catch (Exception e) {
            log.warn("[BackgroundTaskJob] 重试任务异常: taskId={}, error={}",
                    task.getTaskId(), e.getMessage());
        }
    }

    private Object executeDefaultTask(AgentBackgroundTask task) throws Exception {
        taskService.updateProgress(task.getTaskId(), 30, "处理中...");
        Thread.sleep(1000);

        taskService.updateProgress(task.getTaskId(), 60, "处理中...");
        Thread.sleep(1000);

        taskService.updateProgress(task.getTaskId(), 90, "处理中...");
        Thread.sleep(500);

        return java.util.Collections.singletonMap("message", "任务执行完成");
    }
}
