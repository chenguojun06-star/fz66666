package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.dto.*;
import com.fashion.supplychain.intelligence.orchestration.*;
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
}
