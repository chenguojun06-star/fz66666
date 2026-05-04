package com.fashion.supplychain.intelligence.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.GraphExecutionResult;
import com.fashion.supplychain.intelligence.dto.MultiAgentRequest;
import com.fashion.supplychain.intelligence.entity.AgentExecutionLog;
import com.fashion.supplychain.intelligence.orchestration.MultiAgentGraphOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

/**
 * 多代理图（Hybrid Graph MAS v4.1）REST 端点。
 */
@Slf4j
@RestController
@RequestMapping("/api/intelligence/multi-agent-graph")
@PreAuthorize("isAuthenticated()")
public class MultiAgentGraphController {

    @Autowired private MultiAgentGraphOrchestrator graphOrchestrator;
    @Autowired private com.fashion.supplychain.intelligence.orchestration.AgentCheckpointService checkpointService;

    /** 同步执行多代理图分析 */
    @PostMapping("/run")
    public Result<GraphExecutionResult> run(@RequestBody MultiAgentRequest req) {
        GraphExecutionResult result = graphOrchestrator.runGraph(req);
        if (!result.isSuccess()) {
            return Result.fail(result.getErrorMessage() != null
                ? result.getErrorMessage() : "多代理图执行失败");
        }
        return Result.success(result);
    }

    /** SSE 流式执行 — 每个图节点完成后实时推送事件 */
    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@RequestParam(defaultValue = "full") String scene,
                             @RequestParam(required = false) String question) {
        SseEmitter emitter = new SseEmitter(120_000L);
        MultiAgentRequest req = new MultiAgentRequest();
        req.setScene(scene);
        req.setQuestion(question);

        UserContext snapshot = UserContext.get() != null ? UserContext.get().copy() : null;
        Thread.startVirtualThread(() -> {
            try {
                UserContext.set(snapshot);
                graphOrchestrator.runGraphStreaming(req, emitter);
            } catch (Exception e) {
                log.error("[Graph-SSE] 流式执行异常: {}", e.getMessage(), e);
                try { emitter.complete(); } catch (Exception ex) { log.debug("Non-critical error: {}", ex.getMessage()); }
            } finally {
                UserContext.clear();
            }
        });
        return emitter;
    }

    /** 查询执行历史（最近 20 条） */
    @GetMapping("/history")
    public Result<List<AgentExecutionLog>> history(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        int safeSize = Math.min(size, 50);
        List<AgentExecutionLog> logs = graphOrchestrator.listExecutionLogs(
                new LambdaQueryWrapper<AgentExecutionLog>()
                        .eq(AgentExecutionLog::getTenantId, tenantId)
                        .orderByDesc(AgentExecutionLog::getCreateTime)
                        .last("LIMIT " + safeSize + " OFFSET " + ((page - 1) * safeSize)));
        return Result.success(logs);
    }

    /** 提交用户反馈评分（A/B 测试用） */
    @PostMapping("/feedback")
    public Result<Void> feedback(@RequestBody Map<String, Object> body) {
        String executionId = (String) body.get("executionId");
        Integer score = body.get("score") != null ? ((Number) body.get("score")).intValue() : null;
        String note = (String) body.get("note");
        if (executionId == null || score == null || score < 1 || score > 5) {
            return Result.fail("executionId 和 score(1-5) 必填");
        }
        graphOrchestrator.updateExecutionLog(new LambdaUpdateWrapper<AgentExecutionLog>()
                .eq(AgentExecutionLog::getId, executionId)
                .eq(AgentExecutionLog::getTenantId, UserContext.tenantId())
                .set(AgentExecutionLog::getUserFeedback, score)
                .set(AgentExecutionLog::getFeedbackNote, note));
        return Result.success(null);
    }

    /** A/B 测试统计 — 按 scene 聚合近 N 天的执行指标 */
    @GetMapping("/ab-stats")
    public Result<List<Map<String, Object>>> abStats(
            @RequestParam(defaultValue = "30") int days) {
        try {
            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
            int safeDays = Math.min(Math.max(days, 1), 90);
            List<Map<String, Object>> stats = graphOrchestrator.getAbStatsByScene(tenantId, safeDays);
            return Result.success(stats);
        } catch (Exception e) {
            log.warn("[AbStats] 查询失败（表可能不存在）: {}", e.getMessage());
            return Result.success(List.of());
        }
    }

    /** 从Checkpoint恢复执行 */
    @PostMapping("/resume")
    public Result<GraphExecutionResult> resumeFromCheckpoint(@RequestParam String threadId) {
        com.fashion.supplychain.intelligence.dto.AgentState state =
                checkpointService.restoreFromCheckpoint(UserContext.tenantId(), threadId);
        if (state == null) {
            return Result.fail("未找到可恢复的检查点: " + threadId);
        }
        GraphExecutionResult result = new GraphExecutionResult();
        result.setSuccess(true);
        result.setRoute(state.getRoute());
        result.setConfidenceScore(state.getConfidenceScore());
        result.setContextSummary(state.getContextSummary());
        result.setSpecialistResults(state.getSpecialistResults());
        result.setNodeTrace(state.getNodeTrace());
        result.setExecutionId(state.getExecutionId());
        return Result.success(result);
    }
}
