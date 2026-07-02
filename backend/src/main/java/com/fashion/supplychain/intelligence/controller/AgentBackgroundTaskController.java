package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.dto.AgentBackgroundTaskDTO;
import com.fashion.supplychain.intelligence.orchestration.AgentBackgroundTaskOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/intelligence/background-task")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class AgentBackgroundTaskController {

    private final AgentBackgroundTaskOrchestrator taskOrchestrator;

    @GetMapping("/active")
    public Result<List<AgentBackgroundTaskDTO>> getActiveTasks(
            @RequestParam(defaultValue = "20") int limit) {
        return Result.success(taskOrchestrator.getActiveTasks(limit));
    }

    @GetMapping("/list")
    public Result<Map<String, Object>> getTaskList(
            @RequestParam(defaultValue = "1") int pageNum,
            @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(taskOrchestrator.getTaskList(pageNum, pageSize));
    }

    @GetMapping("/{taskId}")
    public Result<AgentBackgroundTaskDTO> getTaskDetail(@PathVariable String taskId) {
        return Result.success(taskOrchestrator.getTaskDetail(taskId));
    }

    @PostMapping("/{taskId}/cancel")
    public Result<Boolean> cancelTask(@PathVariable String taskId) {
        return Result.success(taskOrchestrator.cancelTask(taskId));
    }
}
