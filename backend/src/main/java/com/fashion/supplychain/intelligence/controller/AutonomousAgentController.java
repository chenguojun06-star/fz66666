package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.entity.*;
import com.fashion.supplychain.intelligence.orchestration.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * 自主Agent能力端点 — 根因分析 / 规律发现 / 目标拆解 / Agent例会。
 */
@Slf4j
@RestController
@RequestMapping("/api/intelligence/autonomous")
@PreAuthorize("isAuthenticated()")
public class AutonomousAgentController {

    @Autowired private RootCauseAnalysisOrchestrator rcaOrchestrator;
    @Autowired private PatternDiscoveryOrchestrator patternOrchestrator;
    @Autowired private GoalDecompositionOrchestrator goalOrchestrator;
    @Autowired private AgentMeetingOrchestrator meetingOrchestrator;

    // ── 根因分析 ──

    @PostMapping("/rca/analyze")
    public Result<RootCauseAnalysis> analyzeRootCause(@RequestBody Map<String, String> body) {
        String triggerType = body.getOrDefault("triggerType", "manual");
        String description = body.getOrDefault("description", "");
        String linkedOrderIds = body.getOrDefault("linkedOrderIds", "");
        if (description.isBlank()) {
            return Result.fail("请提供问题描述（description）");
        }
        RootCauseAnalysis rca = rcaOrchestrator.analyze(triggerType, description, linkedOrderIds);
        return Result.success(rca);
    }

    @PostMapping("/rca/list")
    public Result<List<RootCauseAnalysis>> listRca(@RequestBody(required = false) Map<String, Object> body) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String category = body != null ? (String) body.get("category") : null;
        int limit = body != null && body.get("limit") != null ? ((Number) body.get("limit")).intValue() : 20;
        return Result.success(rcaOrchestrator.listByTenant(tenantId, category, limit));
    }

    // ── 规律发现 ──

    @PostMapping("/patterns/discover")
    public Result<List<PatternDiscovery>> discoverPatterns(@RequestBody(required = false) Map<String, Object> body) {
        int lookbackDays = (body != null && body.get("lookbackDays") != null)
                ? ((Number) body.get("lookbackDays")).intValue() : 30;
        return Result.success(patternOrchestrator.discoverPatterns(lookbackDays));
    }

    @PostMapping("/patterns/list")
    public Result<List<PatternDiscovery>> listPatterns(@RequestBody(required = false) Map<String, Object> body) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String type = body != null ? (String) body.get("patternType") : null;
        int limit = body != null && body.get("limit") != null ? ((Number) body.get("limit")).intValue() : 20;
        return Result.success(patternOrchestrator.listByTenant(tenantId, type, limit));
    }

    @PostMapping("/patterns/{id}/apply")
    public Result<Void> markPatternApplied(@PathVariable Long id, @RequestBody Map<String, String> body) {
        patternOrchestrator.markApplied(id, body.getOrDefault("result", ""));
        return Result.success(null);
    }

    // ── 目标拆解 ──

    @PostMapping("/goals/create")
    public Result<GoalDecomposition> createGoal(@RequestBody Map<String, Object> body) {
        String goalType = (String) body.getOrDefault("goalType", "production");
        String title = (String) body.get("title");
        String description = (String) body.getOrDefault("description", "");
        String metricName = (String) body.getOrDefault("metricName", "");
        BigDecimal metricTarget = body.get("metricTarget") != null
                ? new BigDecimal(body.get("metricTarget").toString()) : null;
        String metricUnit = (String) body.getOrDefault("metricUnit", "");
        LocalDateTime deadline = body.get("deadline") != null
                ? LocalDateTime.parse((String) body.get("deadline")) : null;

        if (title == null || title.isBlank()) {
            return Result.fail("请提供目标标题（title）");
        }
        GoalDecomposition goal = goalOrchestrator.createAndDecompose(
                goalType, title, description, metricName, metricTarget, metricUnit, deadline);
        return Result.success(goal);
    }

    @PostMapping("/goals/list")
    public Result<List<GoalDecomposition>> listGoalTree() {
        return Result.success(goalOrchestrator.listGoalTree(UserContext.tenantId()));
    }

    @PostMapping("/goals/{id}/progress")
    public Result<Void> updateGoalProgress(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        int progress = body.get("progress") != null ? ((Number) body.get("progress")).intValue() : 0;
        BigDecimal metricCurrent = body.get("metricCurrent") != null
                ? new BigDecimal(body.get("metricCurrent").toString()) : null;
        goalOrchestrator.updateProgress(id, progress, metricCurrent);
        return Result.success(null);
    }

    // ── Agent例会 ──

    @PostMapping("/meetings/hold")
    public Result<AgentMeeting> holdMeeting(@RequestBody Map<String, String> body) {
        String meetingType = body.getOrDefault("meetingType", "daily");
        String topic = body.getOrDefault("topic", "");
        if (topic.isBlank()) {
            return Result.fail("请提供会议议题（topic）");
        }
        AgentState state = new AgentState();
        state.setTenantId(UserContext.tenantId());
        state.setScene("meeting");
        state.setQuestion(topic);
        AgentMeeting meeting = meetingOrchestrator.holdMeeting(meetingType, topic, state);
        return Result.success(meeting);
    }

    @PostMapping("/meetings/list")
    public Result<List<AgentMeeting>> listMeetings(@RequestBody(required = false) Map<String, Object> body) {
        int limit = (body != null && body.get("limit") != null) ? ((Number) body.get("limit")).intValue() : 10;
        return Result.success(meetingOrchestrator.listByTenant(UserContext.tenantId(), limit));
    }
}
