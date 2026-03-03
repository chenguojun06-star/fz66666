package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.*;
import com.fashion.supplychain.intelligence.orchestration.*;
import com.fashion.supplychain.intelligence.service.AiAdvisorService;
import com.fashion.supplychain.intelligence.service.AiContextBuilderService;
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
    private MaterialShortageOrchestrator materialShortageOrchestrator;

    @Autowired
    private ProcessPriceHintOrchestrator processPriceHintOrchestrator;

    @Autowired
    private DeliveryDateSuggestionOrchestrator deliveryDateSuggestionOrchestrator;

    @Autowired
    private ProcessTemplateOrchestrator processTemplateOrchestrator;

    @Autowired
    private AiAdvisorService aiAdvisorService;

    @Autowired
    private AiContextBuilderService aiContextBuilderService;

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

    // ── 第五批：面料预测 + AI 顾问 ──

    /** 面料缺口预测 — 基于在产订单 BOM 计算面料需求缺口 */
    @GetMapping("/material-shortage")
    public Result<MaterialShortageResponse> materialShortage() {
        return Result.success(materialShortageOrchestrator.predict());
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
                "message", enabled ? "AI 顾问已启用" : "AI 顾问未配置，请设置环境变量 DEEPSEEK_API_KEY"
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
}
