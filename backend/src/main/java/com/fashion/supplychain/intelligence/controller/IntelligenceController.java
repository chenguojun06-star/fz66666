package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import java.util.List;
import com.fashion.supplychain.intelligence.dto.*;
import com.fashion.supplychain.intelligence.orchestration.*;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import com.fashion.supplychain.intelligence.service.AiContextBuilderService;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/intelligence")
@PreAuthorize("isAuthenticated()")
public class IntelligenceController {

    @Autowired
    private SmartPrecheckOrchestrator smartPrecheckOrchestrator;

    @Autowired
    private ProgressPredictOrchestrator progressPredictOrchestrator;

    @Autowired
    private InoutDecisionOrchestrator inoutDecisionOrchestrator;

    @Autowired
    private FeedbackLearningOrchestrator feedbackLearningOrchestrator;

    @Autowired
    private WorkerProfileOrchestrator workerProfileOrchestrator;

    @Autowired
    private BottleneckDetectionOrchestrator bottleneckDetectionOrchestrator;

    @Autowired
    private OrderDeliveryRiskOrchestrator orderDeliveryRiskOrchestrator;

    @Autowired
    private AnomalyDetectionOrchestrator anomalyDetectionOrchestrator;

    @Autowired
    private SmartAssignmentOrchestrator smartAssignmentOrchestrator;

    @Autowired
    private LearningReportOrchestrator learningReportOrchestrator;

    // ── 第三批（12大黑科技）──

    @Autowired
    private LivePulseOrchestrator livePulseOrchestrator;

    @Autowired
    private WorkerEfficiencyOrchestrator workerEfficiencyOrchestrator;

    @Autowired
    private DeliveryPredictionOrchestrator deliveryPredictionOrchestrator;

    @Autowired
    private ProfitEstimationOrchestrator profitEstimationOrchestrator;

    @Autowired
    private FactoryLeaderboardOrchestrator factoryLeaderboardOrchestrator;

    @Autowired
    private RhythmDnaOrchestrator rhythmDnaOrchestrator;

    @Autowired
    private SelfHealingOrchestrator selfHealingOrchestrator;

    @Autowired
    private SmartNotificationOrchestrator smartNotificationOrchestrator;

    @Autowired
    private NlQueryOrchestrator nlQueryOrchestrator;

    @Autowired
    private HealthIndexOrchestrator healthIndexOrchestrator;

    @Autowired
    private SchedulingSuggestionOrchestrator schedulingSuggestionOrchestrator;

    @Autowired
    private DefectHeatmapOrchestrator defectHeatmapOrchestrator;

    @Autowired
    private FinanceAuditOrchestrator financeAuditOrchestrator;

    @Autowired
    private DefectTraceOrchestrator defectTraceOrchestrator;

    @Autowired
    private StyleQuoteSuggestionOrchestrator styleQuoteSuggestionOrchestrator;

    @Autowired
    private StyleIntelligenceProfileOrchestrator styleIntelligenceProfileOrchestrator;

    @Autowired
    private MaterialShortageOrchestrator materialShortageOrchestrator;

    @Autowired
    private FactoryBottleneckOrchestrator factoryBottleneckOrchestrator;

    @Autowired
    private ProcessPriceHintOrchestrator processPriceHintOrchestrator;

    @Autowired
    private ProcessKnowledgeOrchestrator processKnowledgeOrchestrator;

    @Autowired
    private DeliveryDateSuggestionOrchestrator deliveryDateSuggestionOrchestrator;

    @Autowired
    private ProcessTemplateOrchestrator processTemplateOrchestrator;

    // ── 第四批（智能信号/记忆/学习闭环/统一大脑）──
    @Autowired
    private IntelligenceSignalOrchestrator intelligenceSignalOrchestrator;

    @Autowired
    private IntelligenceMemoryOrchestrator intelligenceMemoryOrchestrator;

    @Autowired
    private LearningLoopOrchestrator learningLoopOrchestrator;

    @Autowired
    private TenantIntelligenceBrainOrchestrator tenantIntelligenceBrainOrchestrator;

    @Autowired
    private AiAdvisorService aiAdvisorService;

    @Autowired
    private AiContextBuilderService aiContextBuilderService;

    @Autowired
    private ProcessStatsEngine processStatsEngine;

    @Autowired
    private SupplierScorecardOrchestrator supplierScorecardOrchestrator;

    @Autowired
    private LiveCostTrackerOrchestrator liveCostTrackerOrchestrator;

    @Autowired
    private IntelligenceBrainOrchestrator intelligenceBrainOrchestrator;

    @Autowired
    private ActionCenterOrchestrator actionCenterOrchestrator;

    @Autowired
    private ScanTipsOrchestrator scanTipsOrchestrator;

    @GetMapping("/scan-tips")
    public Result<?> getScanTips(@RequestParam(required = false) String orderNo,
                                 @RequestParam(required = false) String processName) {
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

    @PostMapping("/profit-estimation")
    public Result<ProfitEstimationResponse> profitEstimation(@RequestBody ProfitEstimationRequest request) {
        return Result.success(profitEstimationOrchestrator.estimate(request));
    }

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
    public Result<NlQueryResponse> nlQuery(@RequestBody NlQueryRequest request) {
        return Result.success(nlQueryOrchestrator.query(request));
    }

    @PostMapping("/health-index")
    public Result<HealthIndexResponse> healthIndex() {
        return Result.success(healthIndexOrchestrator.calculate());
    }

    @PostMapping("/scheduling-suggestion")
    public Result<SchedulingSuggestionResponse> schedulingSuggestion(@RequestBody SchedulingSuggestionRequest request) {
        return Result.success(schedulingSuggestionOrchestrator.suggest(request));
    }

    @PostMapping("/defect-heatmap")
    public Result<DefectHeatmapResponse> defectHeatmap() {
        return Result.success(defectHeatmapOrchestrator.analyze());
    }

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

    /** AI 顾问问答 — 优先本地规则引擎，无法回答时调用 DeepSeek */
    @PostMapping("/ai-advisor/chat")
    public Result<?> aiAdvisorChat(@RequestBody java.util.Map<String, String> body) {
        String question = body.getOrDefault("question", "");
        if (question == null || question.isBlank()) {
            return Result.fail("问题不能为空");
        }
        // 先用本地规则引擎（快速响应）
        NlQueryRequest req = new NlQueryRequest();
        req.setQuestion(question);
        NlQueryResponse nlResp = nlQueryOrchestrator.query(req);
        // confidence >= 70：本地规则命中了具体意图，直接返回（快速、免费）
        // confidence < 70（fallback=40）：没命中关键词，转给 DeepSeek 做深度分析
        if (nlResp != null && nlResp.getAnswer() != null && nlResp.getConfidence() >= 70) {
            return Result.success(java.util.Map.of("answer", nlResp.getAnswer(), "source", "local"));
        }
        // 规则引擎无法回答 → 调用 AI
        if (!aiAdvisorService.isEnabled()) {
            return Result.success(java.util.Map.of(
                    "answer", "暂未配置 AI 服务，请联系管理员设置 DEEPSEEK_API_KEY",
                    "source", "none"
            ));
        }
        // 每租户每日配额检查（默认50次/天，防止被滥用或产生意外费用）
        Long tenantId = UserContext.tenantId();
        if (!aiAdvisorService.checkAndConsumeQuota(tenantId)) {
            int used = aiAdvisorService.getTodayUsage(tenantId);
            return Result.success(java.util.Map.of(
                    "answer", String.format(
                            "今日 AI 深度分析次数已达上限（已用 %d 次）。\n" +
                            "数据查询类问题（产量、逾期、工厂排名等）不受此限制，请直接提问。\n" +
                            "如需提升配额请联系管理员。", used),
                    "source", "none"
            ));
        }
        // 构建全系统上下文，让 AI 知道活生订单/健康指数/面料缺口/逾期情况
        String systemPrompt = aiContextBuilderService.buildSystemPrompt();
        String aiAnswer = aiAdvisorService.chat(systemPrompt, question);
        return Result.success(java.util.Map.of(
                "answer", aiAnswer != null ? aiAnswer : "AI 暂时无法回答，请稍后再试",
                "source", "ai"
        ));
    }

    /** 供应商智能评分卡 — 近3个月工厂履约/质量综合评级 */
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
    @PostMapping("/learning/loop")
    public Result<LearningLoopResponse> runLearningLoop() {
        return Result.success(learningLoopOrchestrator.runLoop());
    }

    /** 统一大脑快照（整合信号+记忆+AI综合分析的完整视图） */
    @GetMapping("/brain/unified-snapshot")
    public Result<IntelligenceBrainSnapshotResponse> unifiedBrainSnapshot() {
        return Result.success(tenantIntelligenceBrainOrchestrator.unifiedSnapshot());
    }
}
