package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.annotation.DataTruth;
import com.fashion.supplychain.intelligence.dto.*;
import com.fashion.supplychain.intelligence.orchestration.*;
import com.fashion.supplychain.intelligence.service.AiJobRunLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 智能运营管理端点 — 孤儿数据/扫码建议/报表/指标/Qdrant/知识图谱/优化/工作流/Agent状态/会议
 */
@Slf4j
@RestController
@RequestMapping("/api/intelligence")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class IntelligenceAdminController {

    private final IntelligenceObservabilityOrchestrator observabilityOrchestrator;
    private final ScanTipsOrchestrator scanTipsOrchestrator;
    private final ProfessionalReportOrchestrator professionalReportOrchestrator;
    private final AgentMeetingOrchestrator agentMeetingOrchestrator;
    private final AiJobRunLogService jobRunLogService;

    @Autowired
    private com.fashion.supplychain.intelligence.orchestration.OrphanDataDetector orphanDataDetector;

    @Autowired
    private com.fashion.supplychain.intelligence.service.QdrantService qdrantService;

    @Autowired
    private com.fashion.supplychain.style.service.StyleInfoService styleInfoService;

    @Autowired
    private KnowledgeGraphOrchestrator knowledgeGraphOrchestrator;

    @Autowired
    private OptimizationSolverOrchestrator optimizationSolverOrchestrator;

    @Autowired
    private WorkflowExecutionOrchestrator workflowExecutionOrchestrator;

    @Autowired
    private com.fashion.supplychain.intelligence.service.AgentStateStore agentStateStore;

    // ── 孤儿数据 ──

    @GetMapping("/orphan-data/scan")
    public Result<com.fashion.supplychain.intelligence.dto.OrphanDataScanResultDTO> scanOrphanData() {
        return Result.success(orphanDataDetector.scan());
    }

    @GetMapping("/orphan-data/list")
    public Result<List<com.fashion.supplychain.intelligence.dto.OrphanDataItemDTO>> listOrphanData(
            @RequestParam String tableName,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(orphanDataDetector.listOrphanData(tableName, page, pageSize));
    }

    @PostMapping("/orphan-data/delete")
    public Result<Integer> deleteOrphanData(@RequestBody Map<String, Object> body) {
        String tableName = (String) body.get("tableName");
        @SuppressWarnings("unchecked")
        List<String> ids = (List<String>) body.get("ids");
        return Result.success(orphanDataDetector.deleteOrphanData(tableName, ids));
    }

    // ── 扫码建议 ──

    @GetMapping("/scan-tips")
    public Result<?> getScanTips(@RequestParam(required = false) String orderNo,
                                 @RequestParam(required = false) String processName) {
        return Result.success(scanTipsOrchestrator.getScanTips(orderNo, processName));
    }

    @PostMapping("/scan-advisor/tips")
    public Result<?> getScanTipsByPost(@RequestBody(required = false) Map<String, String> body) {
        String orderNo = body != null ? body.get("orderNo") : null;
        String processName = body != null ? body.get("processName") : null;
        return Result.success(scanTipsOrchestrator.getScanTips(orderNo, processName));
    }

    // ── 专业报表 ──

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/professional-report/preview")
    public Result<Map<String, Object>> previewProfessionalReport(
            @RequestParam(defaultValue = "daily") String type,
            @RequestParam(required = false) String date) {
        LocalDate baseDate = (date != null && !date.isBlank()) ? LocalDate.parse(date) : LocalDate.now();
        return Result.success(professionalReportOrchestrator.generateReportSummary(type, baseDate));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/professional-report/download")
    public ResponseEntity<byte[]> downloadProfessionalReport(
            @RequestParam(defaultValue = "daily") String type,
            @RequestParam(required = false) String date) {
        LocalDate baseDate = (date != null && !date.isBlank()) ? LocalDate.parse(date) : LocalDate.now();
        String typeLabel = "daily".equals(type) ? "日报" : "weekly".equals(type) ? "周报" : "月报";
        String fileName = "运营" + typeLabel + "_" + baseDate + ".xlsx";
        String encodedName = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");
        byte[] data = professionalReportOrchestrator.generateReport(type, baseDate);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encodedName)
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .contentLength(data.length)
                .body(data);
    }

    // ── 超管：指标/任务日志 ──

    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @GetMapping("/metrics/overview")
    public Result<List<Map<String, Object>>> metricsOverview(
            @RequestParam(defaultValue = "7") int days) {
        return Result.success(observabilityOrchestrator.getMetricsOverview(UserContext.tenantId(), days));
    }

    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @GetMapping("/metrics/recent")
    public Result<List<Map<String, Object>>> recentMetrics(
            @RequestParam(defaultValue = "20") int limit) {
        return Result.success(observabilityOrchestrator.getRecentInvocations(UserContext.tenantId(), limit));
    }

    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @GetMapping("/jobs/recent")
    public Result<?> recentJobRuns(@RequestParam(defaultValue = "50") int limit) {
        return Result.success(jobRunLogService.queryRecent(limit));
    }

    // ── Qdrant 向量库补刷 ──

    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @PostMapping("/qdrant/backfill-style-images-tenant-id")
    public Result<?> backfillStyleImagesTenantId() {
        java.util.Map<Long, Long> styleIdToTenantId = new java.util.LinkedHashMap<>();
        styleInfoService.lambdaQuery()
                .select(com.fashion.supplychain.style.entity.StyleInfo::getId,
                        com.fashion.supplychain.style.entity.StyleInfo::getTenantId)
                .isNotNull(com.fashion.supplychain.style.entity.StyleInfo::getTenantId)
                .list()
                .forEach(s -> styleIdToTenantId.put(s.getId(), s.getTenantId()));
        if (styleIdToTenantId.isEmpty()) {
            return Result.success(Map.of("message", "无需补刷，未找到款式数据", "updated", 0));
        }
        int updated = qdrantService.backfillStyleImageTenantIds(styleIdToTenantId);
        return Result.success(Map.of(
                "message", "style_images tenant_id补刷完成",
                "totalStyles", styleIdToTenantId.size(),
                "updated", updated));
    }

    // ── 知识图谱 ──

    @PostMapping("/knowledge-graph/reason")
    @DataTruth(source = DataTruth.Source.AI_DERIVED, description = "知识图谱推理基于图遍历+实体匹配")
    public Result<List<KnowledgeGraphOrchestrator.ReasoningPath>> knowledgeGraphReason(
            @RequestBody Map<String, Object> body) {
        String query = (String) body.getOrDefault("query", "");
        if (query == null || query.isBlank()) {
            return Result.fail("查询不能为空");
        }
        int maxHops = body.get("maxHops") != null ? ((Number) body.get("maxHops")).intValue() : 3;
        return Result.success(knowledgeGraphOrchestrator.reason(UserContext.tenantId(), query, maxHops));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/knowledge-graph/build")
    public Result<Void> buildKnowledgeGraph() {
        knowledgeGraphOrchestrator.buildGraphFromBusinessData(UserContext.tenantId());
        return Result.success(null);
    }

    // ── 优化引擎 ──

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/optimization/scheduling")
    @DataTruth(source = DataTruth.Source.AI_DERIVED, description = "排产优化由LLM+启发式求解生成")
    public Result<OptimizationSolverOrchestrator.SchedulingSolution> optimizeScheduling(
            @RequestBody Map<String, String> body) {
        String userRequest = body.getOrDefault("request", "");
        String context = body.getOrDefault("context", "");
        if (userRequest == null || userRequest.isBlank()) {
            return Result.fail("请求不能为空");
        }
        return Result.success(optimizationSolverOrchestrator.solveScheduling(userRequest, context));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/optimization/procurement")
    @DataTruth(source = DataTruth.Source.AI_DERIVED, description = "采购优化由LLM+启发式求解生成")
    public Result<OptimizationSolverOrchestrator.ProcurementSolution> optimizeProcurement(
            @RequestBody Map<String, String> body) {
        String userRequest = body.getOrDefault("request", "");
        String context = body.getOrDefault("context", "");
        if (userRequest == null || userRequest.isBlank()) {
            return Result.fail("请求不能为空");
        }
        return Result.success(optimizationSolverOrchestrator.solveProcurement(userRequest, context));
    }

    // ── 工作流执行 ──

    @PostMapping("/workflow/execute")
    public Result<com.fashion.supplychain.intelligence.entity.WorkflowExecution> executeWorkflow(
            @RequestBody Map<String, Object> body) {
        String workflowId = (String) body.get("workflowId");
        if (workflowId == null || workflowId.isBlank()) {
            return Result.fail("workflowId不能为空");
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> inputVars = (Map<String, Object>) body.get("inputVariables");
        return Result.success(workflowExecutionOrchestrator.execute(
                workflowId, UserContext.tenantId(), UserContext.userId(), inputVars));
    }

    // ── Agent 状态 ──

    @GetMapping("/agent-state/session/{sessionId}")
    public Result<Map<String, Object>> getAgentSession(@PathVariable String sessionId) {
        com.fashion.supplychain.intelligence.entity.AgentSession session = agentStateStore.getSession(sessionId);
        if (session == null) {
            return Result.fail("会话不存在");
        }
        java.util.List<com.fashion.supplychain.intelligence.entity.AgentCheckpoint> checkpoints =
                agentStateStore.getCheckpoints(sessionId);
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("session", session);
        result.put("checkpoints", checkpoints);
        return Result.success(result);
    }

    @PostMapping("/agent-state/session/{sessionId}/rollback")
    public Result<Void> rollbackAgentSession(@PathVariable String sessionId,
                                              @RequestBody Map<String, Object> body) {
        int targetIteration = ((Number) body.get("targetIteration")).intValue();
        agentStateStore.rollbackToCheckpoint(sessionId, targetIteration);
        return Result.success(null);
    }

    // ── Agent 会议 ──

    @PostMapping("/meeting/hold")
    public Result<com.fashion.supplychain.intelligence.entity.AgentMeeting> holdMeeting(
            @RequestBody Map<String, String> body) {
        String topic = body.getOrDefault("topic", "");
        if (topic.isBlank()) {
            return Result.fail("议题不能为空");
        }
        String meetingType = body.getOrDefault("meetingType", "decision_debate");
        AgentState state = new AgentState();
        state.setTenantId(UserContext.tenantId());
        state.setScene("meeting");
        return Result.success(agentMeetingOrchestrator.holdMeeting(meetingType, topic, state));
    }

    @GetMapping("/meeting/list")
    public Result<List<com.fashion.supplychain.intelligence.entity.AgentMeeting>> listMeetings(
            @RequestParam(defaultValue = "10") int limit) {
        return Result.success(agentMeetingOrchestrator.listByTenant(UserContext.tenantId(), limit));
    }
}
