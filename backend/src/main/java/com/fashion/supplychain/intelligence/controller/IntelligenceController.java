package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.RateLimitUtil;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import com.fashion.supplychain.intelligence.dto.*;
import com.fashion.supplychain.intelligence.annotation.DataTruth;
import com.fashion.supplychain.intelligence.orchestration.*;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import com.fashion.supplychain.intelligence.service.AiJobRunLogService;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RestController
@RequestMapping("/api/intelligence")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class IntelligenceController {

    @Value("${app.sse.timeout:240000}")
    private long sseTimeout;

    private final org.springframework.data.redis.core.StringRedisTemplate stringRedisTemplate;

    @Value("${app.upload.max-size:5242880}")
    private long uploadMaxSize;

    private final SmartPrecheckOrchestrator smartPrecheckOrchestrator;

    private final com.fashion.supplychain.intelligence.orchestration.AiAgentOrchestrator aiAgentOrchestrator;

    private final AiAdvisorChatResponseOrchestrator aiAdvisorChatResponseOrchestrator;


    private final ProgressPredictOrchestrator progressPredictOrchestrator;

    private final InoutDecisionOrchestrator inoutDecisionOrchestrator;

    private final FeedbackLearningOrchestrator feedbackLearningOrchestrator;

    private final AiPatrolOrchestrator aiPatrolOrchestrator;

    private final WorkerProfileOrchestrator workerProfileOrchestrator;

    private final BottleneckDetectionOrchestrator bottleneckDetectionOrchestrator;

    private final OrderDeliveryRiskOrchestrator orderDeliveryRiskOrchestrator;

    private final AnomalyDetectionOrchestrator anomalyDetectionOrchestrator;

    private final SmartAssignmentOrchestrator smartAssignmentOrchestrator;

    private final LearningReportOrchestrator learningReportOrchestrator;

    // ── 第三批（12大黑科技）──

    private final LivePulseOrchestrator livePulseOrchestrator;

    private final WorkerEfficiencyOrchestrator workerEfficiencyOrchestrator;

    private final DeliveryPredictionOrchestrator deliveryPredictionOrchestrator;

    private final ProfitEstimationOrchestrator profitEstimationOrchestrator;

    private final FactoryLeaderboardOrchestrator factoryLeaderboardOrchestrator;

    private final RhythmDnaOrchestrator rhythmDnaOrchestrator;

    private final SelfHealingOrchestrator selfHealingOrchestrator;

    private final SmartNotificationOrchestrator smartNotificationOrchestrator;

    private final NlQueryOrchestrator nlQueryOrchestrator;

    private final HealthIndexOrchestrator healthIndexOrchestrator;

    private final SchedulingSuggestionOrchestrator schedulingSuggestionOrchestrator;

    private final DefectHeatmapOrchestrator defectHeatmapOrchestrator;

    private final FinanceAuditOrchestrator financeAuditOrchestrator;

    private final DefectTraceOrchestrator defectTraceOrchestrator;

    private final StyleQuoteSuggestionOrchestrator styleQuoteSuggestionOrchestrator;

    private final StyleIntelligenceProfileOrchestrator styleIntelligenceProfileOrchestrator;

    private final MaterialShortageOrchestrator materialShortageOrchestrator;

    private final FactoryBottleneckOrchestrator factoryBottleneckOrchestrator;

    private final ProcessPriceHintOrchestrator processPriceHintOrchestrator;

    private final ProcessKnowledgeOrchestrator processKnowledgeOrchestrator;

    private final DeliveryDateSuggestionOrchestrator deliveryDateSuggestionOrchestrator;

    private final ProcessTemplateOrchestrator processTemplateOrchestrator;

    // ── 第四批（智能信号/记忆/学习闭环/统一大脑）──
    private final IntelligenceSignalOrchestrator intelligenceSignalOrchestrator;

    private final IntelligenceMemoryOrchestrator intelligenceMemoryOrchestrator;

    private final LearningLoopOrchestrator learningLoopOrchestrator;

    private final TenantIntelligenceBrainOrchestrator tenantIntelligenceBrainOrchestrator;

    private final AiAdvisorService aiAdvisorService;

    private final ProcessStatsEngine processStatsEngine;

    private final SupplierScorecardOrchestrator supplierScorecardOrchestrator;

    private final ProfessionalReportOrchestrator professionalReportOrchestrator;

    private com.fashion.supplychain.intelligence.orchestration.FileAnalysisOrchestrator fileAnalysisOrchestrator;

    private com.fashion.supplychain.intelligence.mapper.IntelligenceMetricsMapper intelligenceMetricsMapper;

    private final AgentMeetingOrchestrator agentMeetingOrchestrator;

    private final LiveCostTrackerOrchestrator liveCostTrackerOrchestrator;

    private final IntelligenceBrainOrchestrator intelligenceBrainOrchestrator;

    private final ActionCenterOrchestrator actionCenterOrchestrator;

    private final ActionTaskFeedbackOrchestrator actionTaskFeedbackOrchestrator;

    private final ScanTipsOrchestrator scanTipsOrchestrator;

    private final IntelligenceObservabilityOrchestrator observabilityOrchestrator;

    private final com.fashion.supplychain.intelligence.service.AiAgentMetricsService aiAgentMetricsService;

    private final CapacityGapOrchestrator capacityGapOrchestrator;

    private final StagnantAlertOrchestrator stagnantAlertOrchestrator;

    private final ReconciliationAnomalyOrchestrator reconciliationAnomalyOrchestrator;

    private final ApprovalAdvisorOrchestrator approvalAdvisorOrchestrator;

    private final ReplenishmentAdvisorOrchestrator replenishmentAdvisorOrchestrator;

    private final MonthlyBizSummaryOrchestrator monthlyBizSummaryOrchestrator;

    private final StyleDifficultyOrchestrator styleDifficultyOrchestrator;

    private final SafeAdvisorOrchestrator safeAdvisorOrchestrator;

    private final PendingTaskOrchestrator pendingTaskOrchestrator;

    // ── 小云待办任务聚合 ──
    @GetMapping("/pending-tasks/my")
    public Result<List<com.fashion.supplychain.intelligence.dto.PendingTaskDTO>> getMyPendingTasks() {
        return Result.success(pendingTaskOrchestrator.getMyPendingTasks());
    }

    @GetMapping("/pending-tasks/summary")
    public Result<com.fashion.supplychain.intelligence.dto.PendingTaskSummaryDTO> getMyPendingTaskSummary() {
        return Result.success(pendingTaskOrchestrator.getMyPendingTaskSummary());
    }

    private com.fashion.supplychain.intelligence.orchestration.OrphanDataDetector orphanDataDetector;

    @PreAuthorize("hasAnyAuthority('ROLE_SUPER_ADMIN', 'ROLE_tenant_owner')")
    @GetMapping("/orphan-data/scan")
    public Result<com.fashion.supplychain.intelligence.dto.OrphanDataScanResultDTO> scanOrphanData() {
        return Result.success(orphanDataDetector.scan());
    }

    @PreAuthorize("hasAnyAuthority('ROLE_SUPER_ADMIN', 'ROLE_tenant_owner')")
    @GetMapping("/orphan-data/list")
    public Result<List<com.fashion.supplychain.intelligence.dto.OrphanDataItemDTO>> listOrphanData(
            @RequestParam String tableName,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(orphanDataDetector.listOrphanData(tableName, page, pageSize));
    }

    @PreAuthorize("hasAnyAuthority('ROLE_SUPER_ADMIN', 'ROLE_tenant_owner')")
    @PostMapping("/orphan-data/delete")
    public Result<Integer> deleteOrphanData(@RequestBody Map<String, Object> body) {
        String tableName = (String) body.get("tableName");
        @SuppressWarnings("unchecked")
        List<String> ids = (List<String>) body.get("ids");
        return Result.success(orphanDataDetector.deleteOrphanData(tableName, ids));
    }

    @GetMapping("/scan-tips")
    public Result<?> getScanTips(@RequestParam(required = false) String orderNo,
                                 @RequestParam(required = false) String processName) {
        return Result.success(scanTipsOrchestrator.getScanTips(orderNo, processName));
    }

    /** 小程序端通过 POST body 调用 */
    @PostMapping("/scan-advisor/tips")
    public Result<?> getScanTipsByPost(@RequestBody(required = false) java.util.Map<String, String> body) {
        String orderNo = body != null ? body.get("orderNo") : null;
        String processName = body != null ? body.get("processName") : null;
        return Result.success(scanTipsOrchestrator.getScanTips(orderNo, processName));
    }

    @GetMapping("/brain/snapshot")
    public Result<IntelligenceBrainSnapshotResponse> getBrainSnapshot() {
        return Result.success(intelligenceBrainOrchestrator.snapshot());
    }

    @GetMapping("/action-center")
    public Result<ActionCenterResponse> getActionCenter() {
        return Result.success(actionCenterOrchestrator.getCenter());
    }

    @PostMapping("/action-center/task-feedback")
    public Result<ActionTaskFeedbackItem> submitActionTaskFeedback(@RequestBody(required = false) ActionTaskFeedbackRequest request) {
        return actionTaskFeedbackOrchestrator.submitFeedback(request);
    }

    @GetMapping("/action-center/task-feedback/list")
    public Result<List<ActionTaskFeedbackItem>> listActionTaskFeedback(@RequestParam(defaultValue = "20") Integer limit) {
        return Result.success(actionTaskFeedbackOrchestrator.listRecent(limit));
    }

    @PostMapping("/precheck/scan")
    public Result<?> precheckScan(@RequestBody(required = false) PrecheckScanRequest request) {
        return Result.success(smartPrecheckOrchestrator.precheckScan(request));
    }

    @PostMapping("/predict/finish-time")
    public Result<?> predictFinishTime(@RequestBody(required = false) PredictFinishRequest request) {
        return Result.success(progressPredictOrchestrator.predictFinish(request));
    }

    @PostMapping("/recommend/inout")
    public Result<?> recommendInout(@RequestBody(required = false) InoutRecommendRequest request) {
        return Result.success(inoutDecisionOrchestrator.recommend(request));
    }

    @PostMapping("/feedback")
    public Result<?> submitFeedback(@RequestBody(required = false) FeedbackRequest request) {
        return Result.success(feedbackLearningOrchestrator.acceptFeedback(request));
    }

    @PostMapping("/worker-profile")
    public Result<?> getWorkerProfile(@RequestBody(required = false) WorkerProfileRequest request) {
        return Result.success(workerProfileOrchestrator.getProfile(request));
    }

    // ── 第二批智能化端点 ──

    @PostMapping("/bottleneck/detect")
    public Result<?> detectBottleneck(@RequestBody(required = false) BottleneckDetectionRequest request) {
        return Result.success(bottleneckDetectionOrchestrator.detect(request));
    }

    @PostMapping("/delivery-risk/assess")
    public Result<?> assessDeliveryRisk(@RequestBody(required = false) DeliveryRiskRequest request) {
        return Result.success(orderDeliveryRiskOrchestrator.assess(request));
    }

    @PostMapping("/anomaly/detect")
    public Result<?> detectAnomaly() {
        return Result.success(anomalyDetectionOrchestrator.detect());
    }

    @PostMapping("/smart-assignment/recommend")
    public Result<?> recommendAssignment(@RequestBody SmartAssignmentRequest request) {
        return Result.success(smartAssignmentOrchestrator.recommend(request));
    }

    @GetMapping("/learning-report")
    public Result<?> getLearningReport() {
        return Result.success(learningReportOrchestrator.getReport());
    }

    /**
     * 手动触发 AI 学习任务（不待凌晨定时）
     * <p>重新计算当前租户的工序统计，并自动删除平匠名字层
     * （如 "质检领取" 等被错存为父阶段的子工序脱形行）。
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/learning/trigger")
    public Result<?> triggerLearning() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) return Result.fail("无法获取租户ID");
        int updated = processStatsEngine.recomputeForTenant(tenantId);
        return Result.success(java.util.Map.of(
                "message", String.format("学习完成，更新/新增 %d 条工序统计", updated),
                "updatedCount", updated));
    }

    // ── 第三批：12大黑科技端点 ──

    @PostMapping("/live-pulse")
    public Result<LivePulseResponse> livePulse() {
        return Result.success(livePulseOrchestrator.pulse());
    }

    @PostMapping("/worker-efficiency")
    public Result<WorkerEfficiencyResponse> workerEfficiency() {
        return Result.success(workerEfficiencyOrchestrator.evaluate());
    }

    @PostMapping("/delivery-prediction")
    public Result<DeliveryPredictionResponse> deliveryPrediction(@RequestBody DeliveryPredictionRequest request) {
        return Result.success(deliveryPredictionOrchestrator.predict(request));
    }

    @PreAuthorize("hasAnyAuthority('ROLE_SUPER_ADMIN', 'ROLE_tenant_owner')")
    @PostMapping("/profit-estimation")
    public Result<ProfitEstimationResponse> profitEstimation(@RequestBody ProfitEstimationRequest request) {
        return Result.success(profitEstimationOrchestrator.estimate(request));
    }

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/factory-leaderboard")
    public Result<FactoryLeaderboardResponse> factoryLeaderboard() {
        return Result.success(factoryLeaderboardOrchestrator.rank());
    }

    @PostMapping("/rhythm-dna")
    public Result<RhythmDnaResponse> rhythmDna() {
        return Result.success(rhythmDnaOrchestrator.analyze());
    }

    @PostMapping("/self-healing")
    public Result<SelfHealingResponse> selfHealing() {
        return Result.success(selfHealingOrchestrator.diagnose());
    }

    @PostMapping("/smart-notification")
    public Result<SmartNotificationResponse> smartNotification() {
        return Result.success(smartNotificationOrchestrator.generateNotifications());
    }

    @PostMapping("/nl-query")
    @DataTruth(source = DataTruth.Source.AI_DERIVED, description = "自然语言查询结果由AI生成")
    public Result<NlQueryResponse> nlQuery(@RequestBody NlQueryRequest request) {
        return Result.success(nlQueryOrchestrator.query(request));
    }

    @PostMapping("/health-index")
    public Result<HealthIndexResponse> healthIndex() {
        return Result.success(healthIndexOrchestrator.calculate());
    }

    @PostMapping("/scheduling-suggestion")
    @DataTruth(source = DataTruth.Source.REAL_DATA, description = "排产建议基于真实扫码+历史订单数据")
    public Result<SchedulingSuggestionResponse> schedulingSuggestion(@RequestBody SchedulingSuggestionRequest request) {
        return Result.success(schedulingSuggestionOrchestrator.suggest(request));
    }

    @PostMapping("/defect-heatmap")
    public Result<DefectHeatmapResponse> defectHeatmap() {
        return Result.success(defectHeatmapOrchestrator.analyze());
    }

    @PreAuthorize("hasAnyAuthority('ROLE_SUPER_ADMIN', 'ROLE_tenant_owner')")
    @PostMapping("/finance-audit")
    public Result<FinanceAuditResponse> financeAudit() {
        return Result.success(financeAuditOrchestrator.audit());
    }

    // ── 第四批：嵌入式智能功能 ──

    /** 次品溯源 — 按订单聚合各工人的缺陷数据 */
    @GetMapping("/defect-trace")
    public Result<DefectTraceResponse> defectTrace(@RequestParam("orderId") String orderId) {
        return Result.success(defectTraceOrchestrator.trace(orderId));
    }

    /** 款式报价建议 — 基于历史订单与报价单提供定价参考 */
    @GetMapping("/style-quote-suggestion")
    public Result<StyleQuoteSuggestionResponse> styleQuoteSuggestion(@RequestParam("styleNo") String styleNo) {
        return Result.success(styleQuoteSuggestionOrchestrator.suggest(styleNo));
    }

    /** 款式智能档案卡 — 聚合开发、生产、扫码、库存与财务信息 */
    @GetMapping("/style-profile")
    public Result<StyleIntelligenceProfileResponse> styleProfile(
            @RequestParam(value = "styleId", required = false) Long styleId,
            @RequestParam(value = "styleNo", required = false) String styleNo) {
        return Result.success(styleIntelligenceProfileOrchestrator.profile(styleId, styleNo));
    }

    /**
     * 款式制作难度 AI 增强分析（用户主动触发，含图像大模型分析，耗时较长）。
     * <p>传入款式 ID，可选传封面图 URL（不传则自动取 cover 字段）。
     * 结构化评分已在 style-profile 响应中随页面加载，此接口仅用于触发 AI 图像增强。
     */
    @PostMapping("/style-difficulty")
    public Result<StyleIntelligenceProfileResponse.DifficultyAssessment> analyzeStyleDifficulty(
            @RequestBody java.util.Map<String, Object> body) {
        Object idObj = body.get("styleId");
        if (idObj == null) {
            return Result.fail("styleId 不能为空");
        }
        Long styleId = Long.parseLong(String.valueOf(idObj));
        String coverUrl = body.get("coverUrl") != null ? String.valueOf(body.get("coverUrl")) : null;
        StyleIntelligenceProfileResponse.DifficultyAssessment result =
                styleDifficultyOrchestrator.assessWithAiById(styleId, coverUrl);
        return Result.success(result);
    }

    /**
     * 工序单价 AI 提示
     * <p>输入工序名称，实时返回历史价格均值与智能建议定价，辅助工序表格填价。
     *
     * @param processName  工序名称（如"剪线"、"锁边"）
     * @param standardTime 当前标准工时（秒），可选，用于工时差异智能提示
     */
    @GetMapping("/process-price-hint")
    public Result<ProcessPriceHintResponse> processPriceHint(
            @RequestParam("processName") String processName,
            @RequestParam(value = "standardTime", required = false) Integer standardTime) {
        return Result.success(processPriceHintOrchestrator.hint(processName, standardTime));
    }

    /**
     * 工序知识库 — 按工序名聚合当前租户所有款式的历史定价，供 AI 学习与前端展示
     *
     * @param keyword 可选工序名关键字（模糊搜索）
     */
    @GetMapping("/process-knowledge")
    public Result<ProcessKnowledgeResponse> processKnowledge(
            @RequestParam(value = "keyword", required = false) String keyword) {
        return Result.success(processKnowledgeOrchestrator.list(keyword));
    }

    // ── 第五批：面料预测 + AI 顾问 ──

    /** 面料缺口预测 — 基于在产订单 BOM 计算面料需求缺口 */
    @GetMapping("/material-shortage")
    public Result<MaterialShortageResponse> materialShortage() {
        return Result.success(materialShortageOrchestrator.predict());
    }

    /** 工厂工序瓶颈分析 — 基于真实扫码记录计算各工厂卡点工序与完成率 */
    @GetMapping("/factory-bottleneck")
    public Result<List<FactoryBottleneckOrchestrator.FactoryBottleneckItem>> factoryBottleneck() {
        return Result.success(factoryBottleneckOrchestrator.compute());
    }

    /**
     * 交货期智能建议 — 根据工厂产能 + 在制负荷推荐合理交货天数
     *
     * @param factoryName   工厂名称（可空，空则按历史均值降级）
     * @param orderQuantity 订单数量
     */
    @GetMapping("/delivery-date-suggestion")
    public Result<DeliveryDateSuggestionResponse> deliveryDateSuggestion(
            @RequestParam(value = "factoryName", required = false) String factoryName,
            @RequestParam(value = "orderQuantity", required = false) Integer orderQuantity) {
        return Result.success(deliveryDateSuggestionOrchestrator.suggest(factoryName, orderQuantity));
    }

    /**
     * 工序模板AI补全 — 根据品类返回历史高频工序清单（含均价/均工时）
     *
     * @param category 款式品类（如 "男装衬衣"），可空表示全品类统计
     */
    @GetMapping("/process-template")
    public Result<ProcessTemplateResponse> processTemplate(
            @RequestParam(value = "category", required = false) String category) {
        return Result.success(processTemplateOrchestrator.suggest(category));
    }

    /** AI 顾问状态检查 — 检查 AI API Key 是否已配置 */
    @GetMapping("/ai-advisor/status")
    public Result<?> aiAdvisorStatus() {
        boolean enabled = aiAdvisorService.isEnabled();
        return Result.success(java.util.Map.of(
                "enabled", enabled,
                "message", enabled ? "AI 顾问已启用" : "AI 顾问未配置，请设置模型直连或模型网关配置",
                "modelGateway", intelligenceBrainOrchestrator.snapshot().getModelGateway(),
                "observability", intelligenceBrainOrchestrator.snapshot().getObservability()
        ));
    }

    @GetMapping("/ai-agent/metrics")
    public Result<?> aiAgentMetrics() {
        return Result.success(aiAgentMetricsService.getSnapshot());
    }

    /** AI 顾问问答 — 优先本地规则引擎，无法回答时调用 DeepSeek */
    @PostMapping("/ai-advisor/chat")
    public Result<AiAdvisorChatResponse> aiAdvisorChat(@RequestBody java.util.Map<String, String> body, jakarta.servlet.http.HttpServletRequest request) {
        String userId = UserContext.userId();
        if (!RateLimitUtil.checkRateLimit(stringRedisTemplate, "rl:ai:chat:" + userId, 30, 1)) {
            return Result.fail("AI对话请求过于频繁，请稍后再试");
        }
        String question = body.getOrDefault("question", "");
        if (question == null || question.isBlank()) {
            return Result.fail("问题不能为空");
        }
        String pageContext = body.get("pageContext");
        String conversationId = body.get("conversationId");
        Result<String> agentResult = aiAgentOrchestrator.executeAgent(question, pageContext);
        String commandId = aiAgentOrchestrator.consumeLastCommandId();
        var toolRecords = aiAgentOrchestrator.consumeLastToolRecords();
        AiAdvisorChatResponse resp = aiAdvisorChatResponseOrchestrator.build(question, commandId, agentResult, toolRecords);
        if (conversationId != null) { resp.setConversationId(conversationId); }
        return Result.success(resp);
    }

    /** AI 顾问流式问答 — SSE 实时推送思考/工具调用/回答事件 */
    @GetMapping(value = "/ai-advisor/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter aiAdvisorChatStream(@RequestParam String question,
                                          @RequestParam(required = false) String pageContext,
                                          @RequestParam(required = false) String conversationId,
                                          @RequestParam(required = false) String imageUrl,
                                          @RequestParam(required = false) String orderNo,
                                          @RequestParam(required = false) String processName,
                                          @RequestParam(required = false) String stage) {
        String userId = UserContext.userId();
        if (!RateLimitUtil.checkRateLimit(stringRedisTemplate, "rl:ai:sse:" + userId, 30, 1)) {
            SseEmitter emitter = new SseEmitter(3000L);
            try { emitter.send(SseEmitter.event().name("error").data("AI对话请求过于频繁")); emitter.complete(); } catch (Exception e) { log.warn("[AI对话] SSE限流提示发送失败: userId={}", userId); }
            return emitter;
        }
        SseEmitter emitter = new SseEmitter(sseTimeout);
        if (question == null || question.isBlank()) {
            try {
                emitter.send(SseEmitter.event().name("error").data("{\"message\":\"问题不能为空\"}"));
                emitter.complete();
            } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
            return emitter;
        }
        // 捕获当前线程的用户上下文，传递到异步线程
        UserContext currentCtx = UserContext.get();
        UserContext snapshot = new UserContext();
        if (currentCtx != null) {
            snapshot.setTenantId(currentCtx.getTenantId());
            snapshot.setUserId(currentCtx.getUserId());
            snapshot.setUsername(currentCtx.getUsername());
            snapshot.setRole(currentCtx.getRole());
            snapshot.setSuperAdmin(currentCtx.getSuperAdmin());
            snapshot.setTenantOwner(currentCtx.getTenantOwner());
            snapshot.setFactoryId(currentCtx.getFactoryId());
        }

        Thread.startVirtualThread(() -> {
            try {
                UserContext.set(snapshot);
                aiAgentOrchestrator.executeAgentStreaming(question, pageContext, emitter);
            } catch (Exception e) {
                try {
                    emitter.send(SseEmitter.event().name("error").data("{\"message\":\"" + e.getMessage() + "\"}"));
                    emitter.complete();
                } catch (Exception ex) { log.debug("Non-critical error: {}", ex.getMessage()); }
            } finally {
                UserContext.clear();
            }
        });
        return emitter;
    }
    /** 文件上传分析 — 解析 Excel/CSV 内容，返回 Markdown 表格供 AI 分析 */
    @PostMapping(value = "/ai-advisor/upload-analyze", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public Result<java.util.Map<String, String>> uploadAndAnalyze(
            @RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return Result.fail("请选择要上传的文件");
        }
        if (file.getSize() > uploadMaxSize) {
            return Result.fail("文件大小不能超过 5MB");
        }
        String parsedContent = fileAnalysisOrchestrator.analyzeFile(file);
        String safeFilename = java.util.Objects.requireNonNullElse(file.getOriginalFilename(), "unknown");
        return Result.success(java.util.Map.of(
                "filename", safeFilename,
                "parsedContent", parsedContent
        ));
    }

    /**
     * Feature D：AI 回答用户反馈（RLHF 数据采集）。
     * 请求体：{ commandId, score: +1/-1/0, comment? }
     * score=+1 赞 / -1 踩 / 0 清空；comment 可选文本。
     * 对应 t_intelligence_metrics 的 feedback_score / user_feedback / command_id 列（V202611020000 添加）。
     */
    @PostMapping("/ai-feedback")
    public Result<Void> submitAiFeedback(@RequestBody java.util.Map<String, Object> body) {
        String commandId = body.get("commandId") == null ? null : body.get("commandId").toString();
        if (commandId == null || commandId.isBlank()) {
            return Result.fail("commandId 不能为空");
        }
        int score = 0;
        try { score = Integer.parseInt(String.valueOf(body.getOrDefault("score", 0))); } catch (Exception e) { log.warn("[AI反馈] score解析失败: {}", e.getMessage()); }
        String comment = body.get("comment") == null ? null : body.get("comment").toString();
        com.fashion.supplychain.intelligence.entity.IntelligenceMetrics m =
                new com.fashion.supplychain.intelligence.entity.IntelligenceMetrics();
        m.setCommandId(commandId);
        m.setFeedbackScore(score);
        m.setUserFeedback(comment);
        // 追加写入：同 commandId 可能有多条度量，按 trace_id/request_id 关联
        intelligenceMetricsMapper.update(m,
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<com.fashion.supplychain.intelligence.entity.IntelligenceMetrics>()
                        .eq("command_id", commandId));
        log.info("[AiFeedback] commandId={} score={} comment={}", commandId, score, comment);
        return Result.success(null);
    }

    /**
     * Feature I：场景化工作流。根据 key 返回预置提示词触发 AI 对话，
     * 与 t_knowledge_base 中 kb-scn-* 知识对应（V202611020000 附带）。
     */
    @PostMapping("/ai-advisor/scenario/{key}")
    public Result<AiAdvisorChatResponse> scenarioWorkflow(
            @org.springframework.web.bind.annotation.PathVariable String key,
            @RequestBody(required = false) java.util.Map<String, String> body) {
        String prompt;
        switch (key) {
            case "morning_brief":
                prompt = "请用今日运营晨报的结构回答：昨日入库/扫码/工资数据，今日待关注订单与高风险订单，并给出3条经营建议。";
                break;
            case "month_close":
                prompt = "请按月末结算检查：本月工资结算是否完整、对账单待审批项、异常工资记录，并列出今日优先处理动作。";
                break;
            case "quality_review":
                prompt = "请汇总本周质检不良率 Top5 订单、主要不良类型、涉及工厂，并给出改进建议。";
                break;
            case "delay_scan":
                prompt = "请列出最高风险的5个订单（进度<50% 且距离出货≤7天），给出每单补救建议。";
                break;
            case "order_compare":
                String orderNo = body == null ? null : body.get("orderNo");
                prompt = orderNo == null ? "请调用 tool_order_comparison 做异常订单对比分析。" :
                        "请调用 tool_order_comparison 对比订单 " + orderNo + " 与同款正常订单，分析偏差。";
                break;
            case "capacity_radar":
                prompt = "请汇总各工厂产能雷达：订单数/件数/高风险/逾期，按风险等级排序。";
                break;
            default:
                return Result.fail("未知场景：" + key);
        }
        Result<String> agentResult = aiAgentOrchestrator.executeAgent(prompt);
        String commandId = aiAgentOrchestrator.consumeLastCommandId();
        var toolRecords = aiAgentOrchestrator.consumeLastToolRecords();
        return Result.success(aiAdvisorChatResponseOrchestrator.build(prompt, commandId, agentResult, toolRecords));
    }

    /**
     * AI 对话记忆保存 — 小程序 onHide / 会话结束时调用。
     * 触发异步 LLM 摘要并持久化到 t_ai_conversation_memory。
     */
    @PostMapping("/ai-advisor/memory/save")
    public Result<Void> saveAiConversationMemory() {
        aiAgentOrchestrator.saveCurrentConversationToMemory();
        return Result.success(null);
    }

    /** 供应商智能评分卡 — 近3个月工厂履约/质量综合评级 */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/supplier-scorecard")
    public Result<SupplierScorecardResponse> supplierScorecard() {
        return Result.success(supplierScorecardOrchestrator.scorecard());
    }

    /** 实时成本追踪 — 订单工序成本进度与利润预估 */
    @GetMapping("/live-cost")
    public Result<LiveCostResponse> liveCost(@RequestParam String orderId) {
        return Result.success(liveCostTrackerOrchestrator.track(orderId));
    }

    // ── 第四批：智能信号 / 记忆 / 学习闭环 / 统一大脑 ──

    /** 全局信号采集 — 当前租户活跃风险信号汇总 */
    @PostMapping("/signal/collect")
    public Result<IntelligenceSignalResponse> collectSignals() {
        return Result.success(intelligenceSignalOrchestrator.collectAndAnalyze());
    }

    /** 查询未处理信号列表（按优先级过滤） */
    @GetMapping("/signal/open")
    public Result<java.util.List<com.fashion.supplychain.intelligence.entity.IntelligenceSignal>>
            openSignals(@RequestParam(defaultValue = "70") int minPriority) {
        return Result.success(intelligenceSignalOrchestrator.getOpenSignals(
                UserContext.tenantId(), minPriority));
    }

    /** 归档/标记信号为已处理 */
    @PostMapping("/signal/{signalId}/resolve")
    public Result<Void> resolveSignal(
            @org.springframework.web.bind.annotation.PathVariable Long signalId) {
        intelligenceSignalOrchestrator.resolveSignal(signalId, UserContext.tenantId());
        return Result.success();
    }

    /** 写入一条经验记忆 */
    @PostMapping("/memory/save")
    public Result<IntelligenceMemoryResponse> saveMemory(
            @RequestBody java.util.Map<String, String> body) {
        return Result.success(intelligenceMemoryOrchestrator.saveCase(
                body.get("memoryType"), body.get("businessDomain"),
                body.get("title"), body.get("content")));
    }

    /** 相似记忆召回 */
    @GetMapping("/memory/recall")
    public Result<IntelligenceMemoryResponse> recallMemory(
            @RequestParam String query,
            @RequestParam(defaultValue = "5") int topK) {
        return Result.success(intelligenceMemoryOrchestrator.recallSimilar(
                UserContext.tenantId(), query, topK));
    }

    /** 标记记忆为已采纳 */
    @PostMapping("/memory/{memoryId}/adopted")
    public Result<Void> markAdopted(
            @org.springframework.web.bind.annotation.PathVariable Long memoryId) {
        intelligenceMemoryOrchestrator.markAdopted(memoryId);
        return Result.success();
    }

    /** 触发学习闭环（分析近7天反馈，提炼规律沉淀到记忆库） */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/learning/loop")
    public Result<LearningLoopResponse> runLearningLoop() {
        return Result.success(learningLoopOrchestrator.runLoop());
    }

    /** 统一大脑快照（整合信号+记忆+AI综合分析的完整视图） */
    @GetMapping("/brain/unified-snapshot")
    public Result<IntelligenceBrainSnapshotResponse> unifiedBrainSnapshot() {
        return Result.success(tenantIntelligenceBrainOrchestrator.unifiedSnapshot());
    }

    /** 下载专业运营报告（Excel 格式，支持 daily/weekly/monthly） */
    @PreAuthorize("hasAnyAuthority('ROLE_SUPER_ADMIN', 'ROLE_tenant_owner')")
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

    // ── 第五批：AI 可观测性指标（仅超管可见） ──

    /** AI 调用指标概览 — 按场景聚合调用次数/成功率/平均延迟（超管专属） */
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @GetMapping("/metrics/overview")
    public Result<List<java.util.Map<String, Object>>> metricsOverview(
            @RequestParam(defaultValue = "7") int days) {
        return Result.success(observabilityOrchestrator.getMetricsOverview(
                UserContext.tenantId(), days));
    }

        /** AI 最近调用明细 — 输出traceId/traceUrl/工具调用数，便于快速定位异常（超管专属） */
        @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
        @GetMapping("/metrics/recent")
        public Result<List<java.util.Map<String, Object>>> recentMetrics(
            @RequestParam(defaultValue = "20") int limit) {
        return Result.success(observabilityOrchestrator.getRecentInvocations(
            UserContext.tenantId(), limit));
        }

    // ── 第六批：B阶段新增智能驾驶舱能力 ──

    /** B2 - 产能缺口分析：按工厂展示排期缺口与风险级别 */
    @GetMapping("/capacity-gap")
    public Result<CapacityGapResponse> capacityGap() {
        return Result.success(capacityGapOrchestrator.analyze());
    }

    /** B3 - 停滞订单预警：识别3天无扫码的在产订单并给出行动建议 */
    @GetMapping("/stagnant-alert")
    public Result<StagnantAlertResponse> stagnantAlert() {
        return Result.success(stagnantAlertOrchestrator.detect());
    }

    /** B5 - 对账异常优先级：扫描挂单对账单，按优先分降序输出异常列表 */
    @PreAuthorize("hasAnyAuthority('ROLE_SUPER_ADMIN', 'ROLE_tenant_owner')")
    @GetMapping("/reconciliation/anomaly-priority")
    public Result<ReconciliationAnomalyResponse> reconciliationAnomalyPriority() {
        return Result.success(reconciliationAnomalyOrchestrator.analyze());
    }

    /** B6 - 审批建议：对所有PENDING变更申请给出 APPROVE/REJECT/ESCALATE 建议 */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/approval/ai-advice")
    public Result<ApprovalAdvisorResponse> approvalAiAdvice() {
        return Result.success(approvalAdvisorOrchestrator.advise());
    }

    /** B8 - 补料建议：基于缺料预测生成采购优先级与供应商推荐 */
    @GetMapping("/replenishment/suggest")
    public Result<ReplenishmentAdvisorResponse> replenishmentSuggest() {
        return Result.success(replenishmentAdvisorOrchestrator.suggest());
    }

    /** 月度经营汇总：生产完成/次品返修率/各工厂产量/面辅料/成品进出/人工成本/利润
     * 访问规则：平台超管 | 租户主账号(isTenantOwner) | 被显授 INTELLIGENCE_MONTHLY_VIEW 权限的角色 */
    @PreAuthorize("hasAnyAuthority('ROLE_SUPER_ADMIN', 'ROLE_tenant_owner', 'INTELLIGENCE_MONTHLY_VIEW')")
    @GetMapping("/monthly-biz-summary")
    public Result<Map<String, Object>> monthlyBizSummary(
            @RequestParam(defaultValue = "0") int year,
            @RequestParam(defaultValue = "0") int month) {
        java.time.LocalDate now = java.time.LocalDate.now();
        int y = year > 0 ? year : now.getYear();
        int m = month > 0 ? month : now.getMonthValue();
        return Result.success(monthlyBizSummaryOrchestrator.getMonthly(y, m));
    }

    // ── AI主动巡检 ──

    /**
     * 手动触发 AI 巡检（逾期/停滞/结算超时），与定时任务逻辑相同。
     * 返回本次推送通知条数。
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/ai-patrol/run")
    public Result<Integer> runAiPatrol() {
        int count = aiPatrolOrchestrator.patrolTenant(
                com.fashion.supplychain.common.UserContext.tenantId());
        return Result.success(count);
    }

    // ── 第八批：10阶段AI路线图新能力 ──
    private final ForecastEngineOrchestrator forecastEngineOrchestrator;
    private final SalesForecastOrchestrator salesForecastOrchestrator;
    private final WhatIfSimulationOrchestrator whatIfSimulationOrchestrator;
    private final VisualAIOrchestrator visualAIOrchestrator;
    private final CrossTenantBenchmarkOrchestrator crossTenantBenchmarkOrchestrator;
    private final VoiceCommandOrchestrator voiceCommandOrchestrator;

    /** Stage5 — 成本/需求/用量预测（POST body: forecastType/subjectId/horizon） */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/forecast")
    @DataTruth(source = DataTruth.Source.AI_DERIVED, description = "预测由AI模型生成")
    public Result<ForecastEngineResponse> forecast(@RequestBody ForecastEngineRequest req) {
        return Result.success(forecastEngineOrchestrator.forecast(req));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/sales-forecast")
    public Result<SalesForecastOrchestrator.SalesForecastResponse> salesForecast(
            @RequestParam String styleNo,
            @RequestParam(defaultValue = "1") int horizonMonths) {
        return Result.success(salesForecastOrchestrator.forecastSales(styleNo, horizonMonths));
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/size-curve")
    public Result<SalesForecastOrchestrator.SizeCurveResponse> sizeCurve(
            @RequestParam String styleNo) {
        return Result.success(salesForecastOrchestrator.forecastSizeCurve(styleNo));
    }

    /** Stage6 — What-If 推演沙盘（多场景对比） */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/whatif/simulate")
    @DataTruth(source = DataTruth.Source.SIMULATED, description = "What-If推演为模拟数据")
    public Result<WhatIfResponse> whatIfSimulate(@RequestBody WhatIfRequest req) {
        return Result.success(whatIfSimulationOrchestrator.simulate(req));
    }

    /** Stage7 — 视觉AI图像分析（瑕疵检测/款式识别/色差检验） */
    @PostMapping("/visual/analyze")
    @DataTruth(source = DataTruth.Source.AI_DERIVED, description = "视觉AI分析由LLM生成")
    public Result<VisualAIResponse> visualAnalyze(@RequestBody VisualAIRequest req) {
        return Result.success(visualAIOrchestrator.analyze(req));
    }

    /** Stage8 — 本企业经营指标快照（仅读当前租户自身数据，严格隔离） */
    @GetMapping("/benchmark/performance")
    public Result<CrossTenantBenchmarkResponse> benchmarkPerformance() {
        return Result.success(crossTenantBenchmarkOrchestrator.getBenchmark());
    }

    /** Stage10 — 语音多模态指令（transcribedText → NlQuery / ExecutionEngine） */
    @PostMapping("/voice/command")
    public Result<VoiceCommandResponse> voiceCommand(@RequestBody VoiceCommandRequest req) {
        return Result.success(voiceCommandOrchestrator.processVoice(req));
    }

    /** SafeAdvisor — RAG 增强问答（知识库召回 + DeepSeek 推理） */
    @PostMapping("/safe-advisor/analyze")
    public Result<?> safeAdvisorAnalyze(@RequestBody java.util.Map<String, String> body) {
        String question = body.getOrDefault("question", "");
        if (question == null || question.isBlank()) {
            return Result.fail("问题不能为空");
        }
        Result<String> result = safeAdvisorOrchestrator.analyzeAndSuggest(question);
        if (!Integer.valueOf(200).equals(result.getCode())) {
            return Result.success(java.util.Map.of(
                    "answer", result.getMessage(),
                    "source", "error"
            ));
        }
        return Result.success(java.util.Map.of(
                "answer", result.getData(),
                "source", "safe-advisor"
        ));
    }

    // ══════════════════════════════════════════════════════════════════
    //   自愈一键修复 + Agent例会 — v3.24 闭环补全
    // ══════════════════════════════════════════════════════════════════

    /** 自愈一键修复 — 诊断并自动修复可修复项 */
    @PostMapping("/self-healing/repair")
    public Result<SelfHealingResponse> selfHealingRepair() {
        return Result.success(selfHealingOrchestrator.repair());
    }

    /** 召开Agent例会 — 多Agent结构化辩论 → 共识 + 行动项 */
    @PostMapping("/meeting/hold")
    public Result<com.fashion.supplychain.intelligence.entity.AgentMeeting> holdMeeting(
            @RequestBody java.util.Map<String, String> body) {
        String topic = body.getOrDefault("topic", "");
        if (topic.isBlank()) {
            return Result.fail("议题不能为空");
        }
        String meetingType = body.getOrDefault("meetingType", "decision_debate");
        com.fashion.supplychain.intelligence.dto.AgentState state = new com.fashion.supplychain.intelligence.dto.AgentState();
        state.setTenantId(UserContext.tenantId());
        state.setScene("meeting");
        return Result.success(agentMeetingOrchestrator.holdMeeting(meetingType, topic, state));
    }

    /** 查询历史例会记录 */
    @GetMapping("/meeting/list")
    public Result<java.util.List<com.fashion.supplychain.intelligence.entity.AgentMeeting>> listMeetings(
            @RequestParam(defaultValue = "10") int limit) {
        return Result.success(agentMeetingOrchestrator.listByTenant(UserContext.tenantId(), limit));
    }

    // ── 任务可观测性（JobRunObservabilityAspect 自动写入） ──

    private final AiJobRunLogService jobRunLogService;

    /**
     * 查询最近 N 条定时任务执行日志。
     * 超管专属，返回 jobName / methodName / status / durationMs / startTime / resultSummary / errorMessage。
     * 用于快速判断哪个后台任务失败或超时。
     */
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @GetMapping("/jobs/recent")
    public Result<?> recentJobRuns(@RequestParam(defaultValue = "50") int limit) {
        return Result.success(jobRunLogService.queryRecent(limit));
    }

    private com.fashion.supplychain.intelligence.service.QdrantService qdrantService;

    private com.fashion.supplychain.style.service.StyleInfoService styleInfoService;

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
            return Result.success(java.util.Map.of("message", "无需补刷，未找到款式数据", "updated", 0));
        }
        int updated = qdrantService.backfillStyleImageTenantIds(styleIdToTenantId);
        return Result.success(java.util.Map.of(
                "message", "style_images tenant_id补刷完成",
                "totalStyles", styleIdToTenantId.size(),
                "updated", updated));
    }

    // ══════════════════════════════════════════════════════════════════
    //   AI基础设施升级 — 知识图谱 / 优化求解 / 工作流 / Agent状态
    // ══════════════════════════════════════════════════════════════════

    private com.fashion.supplychain.intelligence.orchestration.KnowledgeGraphOrchestrator knowledgeGraphOrchestrator;

    private com.fashion.supplychain.intelligence.orchestration.OptimizationSolverOrchestrator optimizationSolverOrchestrator;

    private com.fashion.supplychain.intelligence.orchestration.WorkflowExecutionOrchestrator workflowExecutionOrchestrator;

    private com.fashion.supplychain.intelligence.service.AgentStateStore agentStateStore;

    /** 知识图谱推理 — 从查询出发多跳遍历图谱，返回推理路径 */
    @PostMapping("/knowledge-graph/reason")
    @DataTruth(source = DataTruth.Source.AI_DERIVED, description = "知识图谱推理基于图遍历+实体匹配")
    public Result<List<com.fashion.supplychain.intelligence.orchestration.KnowledgeGraphOrchestrator.ReasoningPath>> knowledgeGraphReason(
            @RequestBody java.util.Map<String, Object> body) {
        String query = (String) body.getOrDefault("query", "");
        if (query == null || query.isBlank()) {
            return Result.fail("查询不能为空");
        }
        int maxHops = body.get("maxHops") != null ? ((Number) body.get("maxHops")).intValue() : 3;
        return Result.success(knowledgeGraphOrchestrator.reason(UserContext.tenantId(), query, maxHops));
    }

    /** 知识图谱构建 — 从业务数据异步构建知识图谱 */
    @PreAuthorize("hasAnyAuthority('ROLE_SUPER_ADMIN', 'ROLE_tenant_owner')")
    @PostMapping("/knowledge-graph/build")
    public Result<Void> buildKnowledgeGraph() {
        knowledgeGraphOrchestrator.buildGraphFromBusinessData(UserContext.tenantId());
        return Result.success(null);
    }

    /** 排产优化求解 — LLM提取约束 + 启发式求解 */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/optimization/scheduling")
    @DataTruth(source = DataTruth.Source.AI_DERIVED, description = "排产优化由LLM+启发式求解生成")
    public Result<com.fashion.supplychain.intelligence.orchestration.OptimizationSolverOrchestrator.SchedulingSolution> optimizeScheduling(
            @RequestBody java.util.Map<String, String> body) {
        String userRequest = body.getOrDefault("request", "");
        String context = body.getOrDefault("context", "");
        if (userRequest == null || userRequest.isBlank()) {
            return Result.fail("请求不能为空");
        }
        return Result.success(optimizationSolverOrchestrator.solveScheduling(userRequest, context));
    }

    /** 采购优化求解 — LLM提取约束 + 启发式求解 */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/optimization/procurement")
    @DataTruth(source = DataTruth.Source.AI_DERIVED, description = "采购优化由LLM+启发式求解生成")
    public Result<com.fashion.supplychain.intelligence.orchestration.OptimizationSolverOrchestrator.ProcurementSolution> optimizeProcurement(
            @RequestBody java.util.Map<String, String> body) {
        String userRequest = body.getOrDefault("request", "");
        String context = body.getOrDefault("context", "");
        if (userRequest == null || userRequest.isBlank()) {
            return Result.fail("请求不能为空");
        }
        return Result.success(optimizationSolverOrchestrator.solveProcurement(userRequest, context));
    }

    /** 工作流执行 — 按DAG拓扑排序执行工作流节点 */
    @PostMapping("/workflow/execute")
    public Result<com.fashion.supplychain.intelligence.entity.WorkflowExecution> executeWorkflow(
            @RequestBody java.util.Map<String, Object> body) {
        String workflowId = (String) body.get("workflowId");
        if (workflowId == null || workflowId.isBlank()) {
            return Result.fail("workflowId不能为空");
        }
        @SuppressWarnings("unchecked")
        java.util.Map<String, Object> inputVars = (java.util.Map<String, Object>) body.get("inputVariables");
        return Result.success(workflowExecutionOrchestrator.execute(
                workflowId, UserContext.tenantId(), UserContext.userId(), inputVars));
    }

    /** Agent会话状态查询 — 获取会话详情和检查点列表 */
    @GetMapping("/agent-state/session/{sessionId}")
    public Result<java.util.Map<String, Object>> getAgentSession(
            @org.springframework.web.bind.annotation.PathVariable String sessionId) {
        com.fashion.supplychain.intelligence.entity.AgentSession session = agentStateStore.getSession(sessionId);
        if (session == null) {
            return Result.fail("会话不存在");
        }
        java.util.List<com.fashion.supplychain.intelligence.entity.AgentCheckpoint> checkpoints = agentStateStore.getCheckpoints(sessionId);
        java.util.Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("session", session);
        result.put("checkpoints", checkpoints);
        return Result.success(result);
    }

    /** Agent会话回滚 — 回滚到指定检查点 */
    @PostMapping("/agent-state/session/{sessionId}/rollback")
    public Result<Void> rollbackAgentSession(
            @org.springframework.web.bind.annotation.PathVariable String sessionId,
            @RequestBody java.util.Map<String, Object> body) {
        int targetIteration = ((Number) body.get("targetIteration")).intValue();
        agentStateStore.rollbackToCheckpoint(sessionId, targetIteration);
        return Result.success(null);
    }
}
