package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.orchestration.AiMetricsOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.TaskCenterOrchestrator;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequestMapping("/api/intelligence/task-center")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class IntelligenceTaskCenterController {

    private final TaskCenterOrchestrator taskCenterOrchestrator;
    private final AiMetricsOrchestrator aiMetricsOrchestrator;

    @GetMapping("/dashboard")
    public Result<Map<String, Object>> getDashboard() {
        return Result.success(taskCenterOrchestrator.getDashboard());
    }

    @GetMapping("/tasks")
    public Result<Map<String, Object>> listTasks(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String priority,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return Result.success(taskCenterOrchestrator.listTasks(status, priority, page, size));
    }

    @GetMapping("/tasks/{taskId}")
    public Result<Map<String, Object>> getTaskDetail(@PathVariable Long taskId) {
        Map<String, Object> detail = taskCenterOrchestrator.getTaskDetail(taskId);
        if (detail == null) {
            return Result.fail("任务不存在或无权访问");
        }
        return Result.success(detail);
    }

    @PutMapping("/tasks/{taskId}/status")
    public Result<Map<String, Object>> updateTaskStatus(
            @PathVariable Long taskId,
            @RequestBody Map<String, String> body) {
        String newStatus = body.get("status");
        String note = body.get("note");
        Map<String, Object> result = taskCenterOrchestrator.updateTaskStatus(taskId, newStatus, note);
        if (Boolean.FALSE.equals(result.get("success"))) {
            return Result.fail(String.valueOf(result.get("error")));
        }
        return Result.success(result);
    }

    @PostMapping("/tasks/{taskId}/escalate")
    public Result<Map<String, Object>> escalateTask(
            @PathVariable Long taskId,
            @RequestBody Map<String, String> body) {
        String reason = body.getOrDefault("reason", "任务逾期自动升级");
        return Result.success(taskCenterOrchestrator.escalateTask(taskId, reason));
    }

    @GetMapping("/metrics")
    public Result<Map<String, Object>> getMetrics() {
        return Result.success(aiMetricsOrchestrator.getCurrentMetrics());
    }

    @PostMapping("/metrics/snapshot")
    @PreAuthorize("hasRole('super_admin')")
    public Result<String> generateMetricsSnapshot() {
        aiMetricsOrchestrator.generateSnapshot();
        return Result.success("指标快照已生成");
    }
}
