package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.annotation.DataTruth;
import com.fashion.supplychain.intelligence.dto.*;
import com.fashion.supplychain.intelligence.orchestration.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** 智能驾驶舱 — 12大黑科技面板 + 扩展分析面板 */
@Slf4j
@RestController
@RequestMapping("/api/intelligence")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class IntelligencePanelController {

    private final LivePulseOrchestrator livePulseOrchestrator;
    private final WorkerEfficiencyOrchestrator workerEfficiencyOrchestrator;
    private final DeliveryPredictionOrchestrator deliveryPredictionOrchestrator;
    private final ProfitEstimationOrchestrator profitEstimationOrchestrator;
    private final FactoryLeaderboardOrchestrator factoryLeaderboardOrchestrator;
    private final RhythmDnaOrchestrator rhythmDnaOrchestrator;
    private final SelfHealingOrchestrator selfHealingOrchestrator;
    private final SmartNotificationOrchestrator smartNotificationOrchestrator;
    private final HealthIndexOrchestrator healthIndexOrchestrator;
    private final SchedulingSuggestionOrchestrator schedulingSuggestionOrchestrator;
    private final DefectHeatmapOrchestrator defectHeatmapOrchestrator;
    private final FinanceAuditOrchestrator financeAuditOrchestrator;
    private final LiveCostTrackerOrchestrator liveCostTrackerOrchestrator;
    private final SupplierScorecardOrchestrator supplierScorecardOrchestrator;
    private final CapacityGapOrchestrator capacityGapOrchestrator;
    private final StagnantAlertOrchestrator stagnantAlertOrchestrator;
    private final AiPatrolOrchestrator aiPatrolOrchestrator;

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

    @PreAuthorize("isAuthenticated()")
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

    /** 自愈一键修复 — 诊断并自动修复可修复项 */
    @PostMapping("/self-healing/repair")
    public Result<SelfHealingResponse> selfHealingRepair() {
        return Result.success(selfHealingOrchestrator.repair());
    }

    @PostMapping("/smart-notification")
    public Result<SmartNotificationResponse> smartNotification() {
        return Result.success(smartNotificationOrchestrator.generateNotifications());
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

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/finance-audit")
    public Result<FinanceAuditResponse> financeAudit() {
        return Result.success(financeAuditOrchestrator.audit());
    }

    /** 实时成本追踪 */
    @GetMapping("/live-cost")
    public Result<LiveCostResponse> liveCost(@RequestParam String orderId) {
        return Result.success(liveCostTrackerOrchestrator.track(orderId));
    }

    /** 供应商智能评分卡 */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/supplier-scorecard")
    public Result<SupplierScorecardResponse> supplierScorecard() {
        return Result.success(supplierScorecardOrchestrator.scorecard());
    }

    /** B2 - 产能缺口分析 */
    @GetMapping("/capacity-gap")
    public Result<CapacityGapResponse> capacityGap() {
        return Result.success(capacityGapOrchestrator.analyze());
    }

    /** B3 - 停滞订单预警 */
    @GetMapping("/stagnant-alert")
    public Result<StagnantAlertResponse> stagnantAlert() {
        return Result.success(stagnantAlertOrchestrator.detect());
    }

    /** 手动触发 AI 巡检 */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/ai-patrol/run")
    public Result<Integer> runAiPatrol() {
        int count = aiPatrolOrchestrator.patrolTenant(
                com.fashion.supplychain.common.UserContext.tenantId());
        return Result.success(count);
    }
}
