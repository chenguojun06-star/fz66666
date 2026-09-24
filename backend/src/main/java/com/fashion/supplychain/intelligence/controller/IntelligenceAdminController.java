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
import java.util.Collection;
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
    private com.fashion.supplychain.intelligence.orchestration.StyleDifficultyOrchestrator styleDifficultyOrchestrator;

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

    @Autowired
    private com.fashion.supplychain.intelligence.gateway.AiInferenceRouter aiInferenceRouter;

    @Autowired
    private com.fashion.supplychain.intelligence.health.AiComponentHealthIndicator aiComponentHealthIndicator;

    @Autowired
    private AgentCheckpointService checkpointService;

    @Autowired
    private AgentMemoryService memoryService;

    @Autowired
    private AgentCardService agentCardService;

    // ── AI推理路由状态 ──

    @GetMapping("/inference-gateway/status")
    public Result<Map<String, Object>> getInferenceGatewayStatus() {
        return Result.success(aiInferenceRouter.getRoutingStatus());
    }

    /**
     * AI 组件健康状态（红绿灯）。
     * 返回 DeepSeek/Qdrant/视觉模型/LiteLLM/Langfuse 各组件的连通性状态，
     * 供前端 AI 驾驶舱展示红绿灯。
     */
    @GetMapping("/ai-health")
    public Result<Map<String, Object>> getAiHealth() {
        org.springframework.boot.actuate.health.Health health = aiComponentHealthIndicator.health();
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("status", health.getStatus().getCode());
        result.put("components", health.getDetails());
        return Result.success(result);
    }

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

    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
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

    /**
     * 最近 N 条 AI 定时任务执行记录。
     *
     * <p>2026-09-24（D-542）修正：原来内部按 {@code UserContext.tenantId()} 过滤，
     * 但定时任务是后台线程、无用户上下文 → 表里 tenant_id 全为 NULL → **永远返回空**。
     * 本表是系统级作业日志（非租户业务数据），且本接口仅限超管，故改为查全量。
     *
     * @param limit  条数上限（1~500，默认 100）
     * @param status 可选：SUCCESS / FAILED / SKIPPED，不传为全部
     */
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @GetMapping("/jobs/recent")
    public Result<?> recentJobRuns(@RequestParam(defaultValue = "100") int limit,
                                   @RequestParam(required = false) String status) {
        return Result.success(jobRunLogService.queryRecent(limit, status));
    }

    /**
     * AI 定时任务运行概览 + 最慢任务 + 失败 TOP，供页面顶部卡片与两个榜单使用。
     *
     * @param days 统计天数（1~365，默认 7）
     */
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @GetMapping("/jobs/overview")
    public Result<Map<String, Object>> jobRunOverview(@RequestParam(defaultValue = "7") int days) {
        Map<String, Object> overview = new java.util.LinkedHashMap<>();
        overview.put("days", days);
        overview.put("stats", jobRunLogService.queryStats(days));
        overview.put("slowestJobs", jobRunLogService.querySlowestJobs(days, 10));
        overview.put("failureTop", jobRunLogService.queryFailureTop(days, 10));
        return Result.success(overview);
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
                .last("LIMIT 5000")
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

    /**
     * 存量款式图片向量补齐（D-386 以图搜款数据底座）：
     * 逐款 封面图→视觉描述→bge-m3向量→style_images 集合。
     * 每款约 3~5 秒（视觉分析+向量化），用 limit/offset 分批调用直到 total=0。
     */
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @PostMapping("/qdrant/backfill-style-image-vectors")
    public Result<?> backfillStyleImageVectors(
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset) {
        var result = styleDifficultyOrchestrator.backfillStyleImageVectors(limit, offset);
        return Result.success(result);
    }

    @Autowired(required = false)
    private com.fashion.supplychain.intelligence.service.SchemaVectorManager schemaVectorManager;

    @Autowired(required = false)
    private com.fashion.supplychain.intelligence.config.SparseVectorBackfillRunner sparseVectorBackfillRunner;

    /**
     * 稀疏（sparse）向量存量重灌（异步、断点续跑）。
     *
     * <p>存量数据此前只有 dense，切换到命名向量集合后必须重灌一次，混合检索才会真正生效。
     * 分两阶段：① 全库表结构 schema ② SOP 程序记忆；每阶段/每批完成写 Redis 进度，
     * 实例重启从断点续跑。底层是 upsert 覆盖，重复跑无脏数据。</p>
     *
     * <p><b>会调用大量 embedding API（约 = 表数量 + 启用 SOP 数量）</b>，故仅超管可触发。</p>
     */
    @PreAuthorize("isAuthenticated() and (T(com.fashion.supplychain.common.UserContext).isTopAdmin() or hasAuthority('ROLE_SUPER_ADMIN'))")
    @PostMapping("/qdrant/backfill-sparse-vectors")
    public Result<?> backfillSparseVectors() {
        if (sparseVectorBackfillRunner == null) {
            return Result.fail("SparseVectorBackfillRunner 未注册");
        }
        boolean started = sparseVectorBackfillRunner.startAsync();
        return Result.success(Map.of(
                "message", started ? "稀疏向量重灌已在后台启动" : "已有重灌任务在执行，本次忽略",
                "started", started));
    }

    /** 查询稀疏向量重灌进度 */
    @PreAuthorize("isAuthenticated() and (T(com.fashion.supplychain.common.UserContext).isTopAdmin() or hasAuthority('ROLE_SUPER_ADMIN'))")
    @GetMapping("/qdrant/backfill-sparse-vectors/progress")
    public Result<?> getSparseBackfillProgress() {
        if (sparseVectorBackfillRunner == null) {
            return Result.fail("SparseVectorBackfillRunner 未注册");
        }
        return Result.success(sparseVectorBackfillRunner.getProgress());
    }

    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @PostMapping("/qdrant/vectorize-schema")
    public Result<?> vectorizeSchema(@RequestBody(required = false) Map<String, Object> body) {
        if (schemaVectorManager == null) {
            return Result.fail("SchemaVectorManager未启用");
        }
        int count = schemaVectorManager.vectorizeAllSchemas();
        return Result.success(Map.of(
                "message", "数据库Schema向量化完成",
                "vectorizedTables", count));
    }

    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @GetMapping("/qdrant/schema-stats")
    public Result<?> getSchemaStats() {
        if (schemaVectorManager == null) {
            return Result.fail("SchemaVectorManager未启用");
        }
        Collection<com.fashion.supplychain.intelligence.service.SchemaVectorManager.TableSchema> tables =
                schemaVectorManager.getAllSchemas();
        return Result.success(Map.of(
                "totalTables", tables.size(),
                "tables", tables.stream().limit(50).map(t -> Map.of(
                        "tableName", t.getTableName(),
                        "tableComment", t.getTableComment(),
                        "columnCount", t.getColumns().size()
                )).toList()));
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

    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
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

    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @PostMapping("/agent-state/session/{sessionId}/rollback")
    public Result<Void> rollbackAgentSession(@PathVariable String sessionId,
                                              @RequestBody Map<String, Object> body) {
        int targetIteration = ((Number) body.get("targetIteration")).intValue();
        agentStateStore.rollbackToCheckpoint(sessionId, targetIteration);
        return Result.success(null);
    }

    // ── Agent 会议 ──

    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
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

    // ── Checkpoint 管理 ──

    @GetMapping("/checkpoint/history")
    public Result<List<com.fashion.supplychain.intelligence.entity.AgentCheckpoint>> getCheckpointHistory(
            @RequestParam String threadId) {
        return Result.success(checkpointService.getCheckpointHistory(UserContext.tenantId(), threadId));
    }

    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @PostMapping("/checkpoint/restore")
    public Result<AgentState> restoreFromCheckpoint(@RequestParam String threadId) {
        AgentState state = checkpointService.restoreFromCheckpoint(UserContext.tenantId(), threadId);
        if (state == null) {
            return Result.fail("未找到可恢复的检查点");
        }
        return Result.success(state);
    }

    // ── Agent Memory 管理 ──

    @GetMapping("/memory/core")
    public Result<List<com.fashion.supplychain.intelligence.entity.AgentMemoryCore>> getCoreMemory(
            @RequestParam String agentId) {
        return Result.success(memoryService.getAllCoreMemory(UserContext.tenantId(), agentId));
    }

    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @PostMapping("/memory/core")
    public Result<Void> setCoreMemory(@RequestBody Map<String, String> body) {
        memoryService.setCoreMemory(UserContext.tenantId(),
                body.get("agentId"), body.get("key"), body.get("value"));
        return Result.success(null);
    }

    @GetMapping("/memory/archival")
    public Result<List<com.fashion.supplychain.intelligence.entity.AgentMemoryArchival>> getArchivalMemory(
            @RequestParam String agentId,
            @RequestParam(required = false) String contentType,
            @RequestParam(defaultValue = "20") int limit) {
        return Result.success(memoryService.recallArchival(UserContext.tenantId(), agentId, contentType, limit));
    }

    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @PostMapping("/memory/decay")
    public Result<Integer> applyDecayCurve() {
        return Result.success(memoryService.applyDecayCurve(UserContext.tenantId()));
    }

    @GetMapping("/memory/context")
    public Result<String> getCompiledContext(
            @RequestParam String agentId,
            @RequestParam(defaultValue = "10") int coreLimit,
            @RequestParam(defaultValue = "5") int archivalLimit) {
        return Result.success(memoryService.compileContext(UserContext.tenantId(), agentId, coreLimit, archivalLimit));
    }

    // ── Agent Card 管理 ──

    @GetMapping("/agent-card/discover")
    public Result<List<com.fashion.supplychain.intelligence.entity.AgentCard>> discoverAgents(
            @RequestParam(required = false) String skill) {
        return Result.success(agentCardService.discoverAgents(UserContext.tenantId(), skill));
    }

    @GetMapping("/agent-card/{agentId}")
    public Result<com.fashion.supplychain.intelligence.entity.AgentCard> getAgentCard(
            @PathVariable String agentId) {
        return Result.success(agentCardService.getAgent(UserContext.tenantId(), agentId));
    }
}
