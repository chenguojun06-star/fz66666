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
}
