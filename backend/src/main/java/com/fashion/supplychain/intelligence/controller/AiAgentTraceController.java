package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.orchestration.AiAgentTraceOrchestrator;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/intelligence/ai-agent")
@PreAuthorize("isAuthenticated()")
public class AiAgentTraceController {

    @Autowired
    private AiAgentTraceOrchestrator aiAgentTraceOrchestrator;

    @GetMapping("/traces/recent")
    public Result<List<Map<String, Object>>> recent(@RequestParam(defaultValue = "20") int limit,
                                                    @RequestParam(required = false) String toolName,
                                                    @RequestParam(required = false) String status,
                                                    @RequestParam(required = false) String executorKeyword,
                                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startTime,
                                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endTime) {
        try {
            return Result.success(aiAgentTraceOrchestrator.listRecentRequestSummaries(limit, toolName, status, executorKeyword, startTime, endTime));
        } catch (Exception e) {
            return Result.success(Collections.emptyList());
        }
    }

    @GetMapping("/traces/{commandId}")
    public Result<?> detail(@PathVariable String commandId) {
        return Result.success(aiAgentTraceOrchestrator.queryTrace(commandId));
    }
}
