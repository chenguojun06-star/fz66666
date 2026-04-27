package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.annotation.DataTruth;
import com.fashion.supplychain.intelligence.dto.*;
import com.fashion.supplychain.intelligence.orchestration.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * 智能分析端点 — 预测/推荐/工人/工序/样板/物料/工厂瓶颈等分析能力
 */
@Slf4j
@RestController
@RequestMapping("/api/intelligence")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class IntelligenceAnalyticsController {

    private final SmartPrecheckOrchestrator smartPrecheckOrchestrator;
    private final ProgressPredictOrchestrator progressPredictOrchestrator;
    private final InoutDecisionOrchestrator inoutDecisionOrchestrator;
    private final FeedbackLearningOrchestrator feedbackLearningOrchestrator;
    private final WorkerProfileOrchestrator workerProfileOrchestrator;
    private final BottleneckDetectionOrchestrator bottleneckDetectionOrchestrator;
    private final OrderDeliveryRiskOrchestrator orderDeliveryRiskOrchestrator;
    private final AnomalyDetectionOrchestrator anomalyDetectionOrchestrator;
    private final SmartAssignmentOrchestrator smartAssignmentOrchestrator;
    private final LearningReportOrchestrator learningReportOrchestrator;
    private final com.fashion.supplychain.intelligence.service.ProcessStatsEngine processStatsEngine;
    private final DefectTraceOrchestrator defectTraceOrchestrator;
    private final StyleQuoteSuggestionOrchestrator styleQuoteSuggestionOrchestrator;
    private final StyleIntelligenceProfileOrchestrator styleIntelligenceProfileOrchestrator;
    private final StyleDifficultyOrchestrator styleDifficultyOrchestrator;
    private final ProcessPriceHintOrchestrator processPriceHintOrchestrator;
    private final ProcessKnowledgeOrchestrator processKnowledgeOrchestrator;
    private final MaterialShortageOrchestrator materialShortageOrchestrator;
    private final FactoryBottleneckOrchestrator factoryBottleneckOrchestrator;
    private final DeliveryDateSuggestionOrchestrator deliveryDateSuggestionOrchestrator;
    private final ProcessTemplateOrchestrator processTemplateOrchestrator;

    @PostMapping("/precheck/scan")
    public Result<PrecheckScanResponse> precheck(@RequestBody(required = false) PrecheckScanRequest req) {
        return Result.success(smartPrecheckOrchestrator.precheckScan(req));
    }

    @PostMapping("/predict/finish-time")
    public Result<PredictFinishResponse> predictFinishTime(@RequestBody(required = false) PredictFinishRequest req) {
        return Result.success(progressPredictOrchestrator.predictFinish(req));
    }

    @PostMapping("/recommend/inout")
    public Result<InoutRecommendResponse> recommendInout(@RequestBody(required = false) InoutRecommendRequest req) {
        return Result.success(inoutDecisionOrchestrator.recommend(req));
    }

    @PostMapping("/feedback")
    public Result<?> submitFeedback(@RequestBody(required = false) FeedbackRequest req) {
        return Result.success(feedbackLearningOrchestrator.acceptFeedback(req));
    }

    @PostMapping("/worker-profile")
    public Result<WorkerProfileResponse> getWorkerProfile(@RequestBody(required = false) WorkerProfileRequest req) {
        return Result.success(workerProfileOrchestrator.getProfile(req));
    }

    @PostMapping("/bottleneck/detect")
    public Result<BottleneckDetectionResponse> detectBottleneck(@RequestBody(required = false) BottleneckDetectionRequest req) {
        return Result.success(bottleneckDetectionOrchestrator.detect(req));
    }

    @PostMapping("/delivery-risk/assess")
    public Result<DeliveryRiskResponse> assessDeliveryRisk(@RequestBody DeliveryRiskRequest req) {
        return Result.success(orderDeliveryRiskOrchestrator.assess(req));
    }

    @PostMapping("/anomaly/detect")
    public Result<AnomalyDetectionResponse> detectAnomaly() {
        return Result.success(anomalyDetectionOrchestrator.detect());
    }

    @PostMapping("/smart-assignment/recommend")
    public Result<SmartAssignmentResponse> smartAssignment(@RequestBody SmartAssignmentRequest req) {
        return Result.success(smartAssignmentOrchestrator.recommend(req));
    }

    @GetMapping("/learning-report")
    public Result<LearningReportResponse> learningReport() {
        return Result.success(learningReportOrchestrator.getReport());
    }

    @PostMapping("/learning/trigger")
    public Result<Void> triggerLearning() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        processStatsEngine.recomputeForTenant(tenantId);
        return Result.success(null);
    }

    @GetMapping("/defect-trace")
    @DataTruth(source = DataTruth.Source.REAL_DATA, description = "质检扫码实录")
    public Result<DefectTraceResponse> defectTrace(@RequestParam(required = false) String orderId) {
        return Result.success(defectTraceOrchestrator.trace(orderId));
    }

    @GetMapping("/style-quote-suggestion")
    public Result<StyleQuoteSuggestionResponse> styleQuoteSuggestion(@RequestParam String styleNo) {
        return Result.success(styleQuoteSuggestionOrchestrator.suggest(styleNo));
    }

    @GetMapping("/style-profile")
    public Result<StyleIntelligenceProfileResponse> styleProfile(
            @RequestParam(value = "styleId", required = false) Long styleId,
            @RequestParam(value = "styleNo", required = false) String styleNo) {
        return Result.success(styleIntelligenceProfileOrchestrator.profile(styleId, styleNo));
    }

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

    @GetMapping("/process-price-hint")
    public Result<ProcessPriceHintResponse> processPriceHint(
            @RequestParam("processName") String processName,
            @RequestParam(value = "standardTime", required = false) Integer standardTime) {
        return Result.success(processPriceHintOrchestrator.hint(processName, standardTime));
    }

    @GetMapping("/process-knowledge")
    public Result<ProcessKnowledgeResponse> processKnowledge(
            @RequestParam(value = "keyword", required = false) String keyword) {
        return Result.success(processKnowledgeOrchestrator.list(keyword));
    }

    @GetMapping("/material-shortage")
    public Result<MaterialShortageResponse> materialShortage() {
        return Result.success(materialShortageOrchestrator.predict());
    }

    @GetMapping("/factory-bottleneck")
    public Result<java.util.List<FactoryBottleneckOrchestrator.FactoryBottleneckItem>> factoryBottleneck() {
        return Result.success(factoryBottleneckOrchestrator.compute());
    }

    @GetMapping("/delivery-date-suggestion")
    public Result<DeliveryDateSuggestionResponse> deliveryDateSuggestion(
            @RequestParam String styleNo,
            @RequestParam int quantity) {
        return Result.success(deliveryDateSuggestionOrchestrator.suggest(styleNo, quantity));
    }

    @GetMapping("/process-template")
    public Result<ProcessTemplateResponse> processTemplate(
            @RequestParam(value = "category", required = false) String category) {
        return Result.success(processTemplateOrchestrator.suggest(category));
    }
}
