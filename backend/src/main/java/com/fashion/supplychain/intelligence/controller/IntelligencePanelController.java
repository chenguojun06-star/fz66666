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
    private final PreOrderDeliveryPredictionOrchestrator preOrderDeliveryPredictionOrchestrator;
    private final FactoryActiveOrderOrchestrator factoryActiveOrderOrchestrator;
    private final FactoryDailyOutputOrchestrator factoryDailyOutputOrchestrator;
    private final DecisionCardOrchestrator decisionCardOrchestrator;

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

    /** D-754 P4：采纳排产建议 — 写回订单工厂/计划起止，并在订单操作日志留采纳痕迹 */
    @PostMapping("/scheduling-suggestion/adopt")
    @DataTruth(source = DataTruth.Source.REAL_DATA, description = "采纳排产建议写回生产订单并留痕")
    public Result<java.util.Map<String, Object>> adoptScheduling(@RequestBody SchedulingAdoptionRequest request) {
        return Result.success(schedulingSuggestionOrchestrator.adopt(request));
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

    /**
     * 预下单三档交期预测（不依赖 orderId）
     * 下单人员选择工厂+输入数量后即可预测三档完工日期，实现"下单前可见时间线"。
     */
    @PostMapping("/pre-order-delivery-prediction")
    public Result<PreOrderDeliveryPredictionResponse> preOrderDeliveryPrediction(
            @RequestBody PreOrderDeliveryPredictionRequest request) {
        return Result.success(preOrderDeliveryPredictionOrchestrator.predictByFactory(request));
    }

    /**
     * 工厂在产订单明细（下单页详情抽屉用）
     * 返回该工厂当前所有在产订单，含风险等级和距交期天数。
     */
    @GetMapping("/factory-active-orders")
    public Result<java.util.List<FactoryActiveOrderDTO>> factoryActiveOrders(
            @RequestParam String factoryName) {
        return Result.success(factoryActiveOrderOrchestrator.getActiveOrdersByFactory(factoryName));
    }

    /**
     * 工厂逐日产出（产能走势图，2026-10-29 新增）。
     *
     * <p>为什么加：工厂详情抽屉原来只有汇总数字，"日均 277 件/天"看不出是稳定 277
     * 还是 14 天只干了 3 天，用户无法判断该催单还是转单。本端点给出逐日序列 +
     * 峰谷 + 连续零产出天数，让产能稳定性可见。
     *
     * <p>口径与预下单预测的 factoryDailyVelocity 完全一致（近 N 个完整日，截至昨天），
     * 因此图上均线与预测数字不会互相打架。
     *
     * @param factoryName 工厂名
     * @param days        窗口天数（7~60，默认 14）
     */
    @GetMapping("/factory-daily-output")
    public Result<FactoryDailyOutputResponse> factoryDailyOutput(
            @RequestParam String factoryName,
            @RequestParam(required = false, defaultValue = "14") Integer days) {
        return Result.success(factoryDailyOutputOrchestrator.build(factoryName, days));
    }

    /**
     * D-853：AI 决策建议列表（当前租户最近 N 条）。
     *
     * <p>2026-10-23 核实：`t_ai_decision_card` 已积累 58 张 AI 建议，adopted 全为 0、
     * 人工反馈 0 条。根因不是用户不采纳——`DecisionCardOrchestrator.recentForCurrentTenant()`
     * 和 `feedback()` 都写好了，但**没有任何端点暴露**，前端连列都列不出来：
     * AI 给了建议，人看不到，等于没给。本端点闭合「生成 → 可见 → 采纳 → 反馈」。
     */
    @GetMapping("/decision-cards")
    public Result<java.util.List<com.fashion.supplychain.intelligence.entity.AiDecisionCard>> decisionCards(
            @RequestParam(defaultValue = "20") int limit) {
        return Result.success(decisionCardOrchestrator.recentForCurrentTenant(Math.max(1, Math.min(limit, 100))));
    }

    /**
     * D-853：AI 建议采纳/反馈入口。
     *
     * <p>此前 `feedback()` 无端点调用 → 采纳率恒为 0、AI 准确率无真值可评估。
     *
     * @param adopted       1=采纳，0=未采纳
     * @param reason        未采纳原因（可空）
     * @param feedbackScore 1-5 分（可空）
     */
    @PostMapping("/decision-cards/{id}/feedback")
    public Result<Void> decisionCardFeedback(
            @PathVariable Long id,
            @RequestParam(defaultValue = "0") int adopted,
            @RequestParam(required = false) String reason,
            @RequestParam(required = false) Integer feedbackScore) {
        decisionCardOrchestrator.feedback(id, adopted, reason, feedbackScore);
        return Result.success(null);
    }
}
