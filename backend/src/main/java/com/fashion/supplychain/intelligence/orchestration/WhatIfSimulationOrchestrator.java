package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.OrderStatusConstants;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.WhatIfRequest;
import com.fashion.supplychain.intelligence.dto.WhatIfResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.FactoryCapacityOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Stage6 — What-If推演沙盘 Orchestrator
 * 对指定订单集合进行若干"如果…会怎样"场景模拟，返回各场景相对基准的变化。
 * 纯计算（无持久化），结合 LLM 生成综合建议。
 */
@Service
@Slf4j
public class WhatIfSimulationOrchestrator {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

        @Autowired
        private FactoryCapacityOrchestrator factoryCapacityOrchestrator;

        // 复用规范终态定义（包含 archived），保证与 OrderStatusConstants 一致
        private static final Set<String> TERMINAL_STATUSES = OrderStatusConstants.TERMINAL_STATUSES;

    // ──────────────────────────────────────────────────────────────────
    // 公共入口
    // ──────────────────────────────────────────────────────────────────

    public WhatIfResponse simulate(WhatIfRequest req) {
        if (req == null) return errorResponse("请求不能为空");

        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<ProductionOrder> orders = fetchOrders(tenantId, req.getOrderIds());
        if (orders.isEmpty()) return errorResponse("未找到有效订单");

        BatchStats stats = buildBatchStats(orders);

        // ── 基准快照
        WhatIfResponse.ScenarioResult baseline = computeBaseline(stats);

        // ── 推演各场景
        List<WhatIfResponse.ScenarioResult> scenarioResults = new ArrayList<>();
        if (req.getScenarios() != null) {
            for (Map<String, Object> s : req.getScenarios()) {
                String type = String.valueOf(s.getOrDefault("type", "UNKNOWN"));
                WhatIfResponse.ScenarioResult sr = simulateScenario(type, s, stats, baseline);
                scenarioResults.add(sr);
            }
        }

        // ── 找最优场景
        String bestKey = baseline.getScenarioKey();
        int bestScore = baseline.getScore() != null ? baseline.getScore() : 0;
        for (WhatIfResponse.ScenarioResult sr : scenarioResults) {
            if (sr.getScore() != null && sr.getScore() > bestScore) {
                bestScore = sr.getScore();
                bestKey = sr.getScenarioKey();
            }
        }

        // ── LLM综合摘要
        String summary = llmSummary(baseline, scenarioResults, bestKey);

        WhatIfResponse resp = new WhatIfResponse();
        resp.setSummary(summary);
        resp.setBaseline(baseline);
        resp.setScenarios(scenarioResults);
        resp.setRecommendedScenario(bestKey);
        return resp;
    }

    // ──────────────────────────────────────────────────────────────────
    // 基准计算（现状）
    // ──────────────────────────────────────────────────────────────────

    private WhatIfResponse.ScenarioResult computeBaseline(BatchStats stats) {
        WhatIfResponse.ScenarioResult r = new WhatIfResponse.ScenarioResult();
        r.setScenarioKey("baseline");
        r.setDescription("当前状态（不作调整）");
        r.setFinishDateDeltaDays(0);
        r.setCostDelta(0.0);
        r.setOverdueRiskDelta(0.0);
        int score = clamp(82
                - stats.getOverdueCount() * 12
                - stats.getAtRiskCount() * 5
                - (int) Math.round(Math.max(0, 100 - stats.getAverageProgress()) / 8.0), 15, 92);
        r.setScore(score);
        r.setAction("维持现状");
        r.setRationale(String.format("已选%d单，剩余%.0f件，平均进度%.0f%%，逾期%d单，高风险%d单，平均剩余%.1f天。",
                stats.getOrderCount(), stats.getRemainingQuantity(), stats.getAverageProgress(),
                stats.getOverdueCount(), stats.getAtRiskCount(), stats.getAverageDaysLeft()));
        return r;
    }

    // ──────────────────────────────────────────────────────────────────
    // 场景模拟
    // ──────────────────────────────────────────────────────────────────

    private WhatIfResponse.ScenarioResult simulateScenario(String type,
                                                            Map<String, Object> params,
                                                            BatchStats stats,
                                                            WhatIfResponse.ScenarioResult baseline) {
        WhatIfResponse.ScenarioResult r = new WhatIfResponse.ScenarioResult();
        int value = parseInt(params.getOrDefault("value", 0));
        double baseCost = stats.getBaseCost();
        int safeValue = Math.max(0, value);

        switch (type.toUpperCase()) {
            case "ADVANCE_DELIVERY": {
                int accelDays = clamp(safeValue, 1, 14);
                r.setScenarioKey("ADVANCE_DELIVERY_" + safeValue + "d");
                r.setDescription("将交货期提前 " + safeValue + " 天");
                r.setFinishDateDeltaDays(-accelDays);
                r.setCostDelta(round(baseCost * 0.045 * accelDays));
                r.setOverdueRiskDelta(round(-Math.min(32.0, accelDays * 3.8 + stats.getAtRiskCount() * 2.0)));
                r.setScore(clamp((baseline.getScore() == null ? 50 : baseline.getScore()) - accelDays * 2, 10, 92));
                r.setAction("需增加工人加班或调配外包工序");
                r.setRationale(String.format("按剩余%.0f件测算，提前%d天需要压缩当前节拍，成本会上升。", stats.getRemainingQuantity(), accelDays));
                break;
            }
            case "ADD_WORKERS": {
                int accelDays = clamp((int) Math.round(stats.getRemainingQuantity() / 1800.0 * Math.min(safeValue, 30) * 0.55), 1, 12);
                double extraCost = round(Math.max(1, Math.ceil(stats.getAverageDaysLeft())) * safeValue * 180.0);
                r.setScenarioKey("ADD_WORKERS_" + safeValue + "人");
                r.setDescription("当前工厂增加 " + safeValue + " 名工人");
                r.setFinishDateDeltaDays(-accelDays);
                r.setCostDelta(extraCost);
                r.setOverdueRiskDelta(round(-Math.min(30.0, accelDays * 3.0 + Math.min(10, safeValue))));
                r.setScore(clamp((baseline.getScore() == null ? 50 : baseline.getScore()) + accelDays * 4 - Math.max(0, safeValue - 12), 25, 94));
                r.setAction("联系工厂人事安排临时工");
                r.setRationale(String.format("基于剩余%.0f件与平均剩余%.1f天估算，增员%d人可回收约%d天，但会增加短期人工成本。",
                        stats.getRemainingQuantity(), stats.getAverageDaysLeft(), safeValue, accelDays));
                break;
            }
            case "CHANGE_FACTORY": {
                String targetFactoryName = stringify(params.get("factoryName"));
                FactoryComparison comparison = compareFactoryCapacity(stats, targetFactoryName);
                int transferPenaltyDays = 2;
                int finishDelta = clamp(comparison.getTargetLoadDays() - comparison.getCurrentLoadDays() + transferPenaltyDays, -12, 10);
                double riskDelta = comparison.isTargetCapacityAvailable()
                        ? round(clampDouble(finishDelta * 2.8, -28, 24))
                        : 8.0;
                r.setScenarioKey(targetFactoryName.isBlank() ? "CHANGE_FACTORY" : "CHANGE_FACTORY_" + targetFactoryName);
                r.setDescription(targetFactoryName.isBlank() ? "将订单转至其他工厂生产" : "将订单转至「" + targetFactoryName + "」生产");
                r.setTargetFactoryName(targetFactoryName.isBlank() ? null : targetFactoryName);
                r.setFinishDateDeltaDays(finishDelta);
                r.setCostDelta(round(baseCost * (comparison.isTargetCapacityAvailable() && finishDelta < 0 ? 0.08 : 0.12)));
                r.setOverdueRiskDelta(riskDelta);
                r.setScore(clamp((baseline.getScore() == null ? 50 : baseline.getScore()) + (finishDelta < 0 ? 16 : -10) - Math.max(0, finishDelta), 18, 90));
                r.setAction(finishDelta < 0 ? "目标工厂负载更优，可作为转厂候选" : "转厂收益不明显，除非当前工厂已失控再考虑");
                r.setRationale(comparison.getRationale());
                break;
            }
            case "COST_REDUCE": {
                int delayDays = clamp((int) Math.round(safeValue / 4.0 + stats.getAtRiskCount() * 0.6), 1, 10);
                r.setScenarioKey("COST_REDUCE_" + safeValue + "pct");
                r.setDescription("目标降低成本 " + safeValue + "%");
                r.setFinishDateDeltaDays(delayDays);
                r.setCostDelta(round(-baseCost * Math.min(safeValue, 30) / 100.0));
                r.setOverdueRiskDelta(round(Math.min(35.0, delayDays * 3.4 + stats.getAtRiskCount() * 1.8)));
                r.setScore(clamp((baseline.getScore() == null ? 50 : baseline.getScore()) - Math.max(4, safeValue / 2), 20, 78));
                r.setAction("在非紧急订单上使用替代物料或调整工艺");
                r.setRationale(String.format("按当前高风险%d单测算，降本%d%%会牺牲部分节拍，预计拖慢约%d天。",
                        stats.getAtRiskCount(), safeValue, delayDays));
                break;
            }
            case "DELAY_START": {
                int delayDays = clamp(safeValue, 1, 14);
                r.setScenarioKey("DELAY_START_" + delayDays + "d");
                r.setDescription("延迟开工 " + delayDays + " 天（腾出产线做其他急单）");
                r.setFinishDateDeltaDays(delayDays);
                r.setCostDelta(0.0);
                r.setOverdueRiskDelta(round(Math.min(40.0, delayDays * 4.0 + stats.getOverdueCount() * 4.0)));
                r.setScore(clamp((baseline.getScore() == null ? 50 : baseline.getScore()) - delayDays * 6, 5, 65));
                r.setAction("仅当交货期充裕且该批订单不是当前优先级时可考虑");
                r.setRationale(String.format("当前平均剩余%.1f天，若再延后%d天，交期压力会快速放大。", stats.getAverageDaysLeft(), delayDays));
                break;
            }
            default: {
                r.setScenarioKey(type);
                r.setDescription("未知场景类型：" + type);
                r.setScore(0);
                r.setAction("请检查 scenarioType 取值");
                r.setRationale("前端提交的场景类型不在 What-If 支持范围内。");
            }
        }
        return r;
    }

    // ──────────────────────────────────────────────────────────────────
    // 工具方法
    // ──────────────────────────────────────────────────────────────────

    private List<ProductionOrder> fetchOrders(Long tenantId, String orderIdsStr) {
        QueryWrapper<ProductionOrder> qw = new QueryWrapper<ProductionOrder>()
                .eq("tenant_id", tenantId)
                .eq("delete_flag", 0);
        if (orderIdsStr != null && !orderIdsStr.isBlank()) {
            qw.in("id", (Object[]) orderIdsStr.split(","));
        } else {
            qw.last("LIMIT 20");  // 默认最近20个在产订单
        }
        return productionOrderService.list(qw).stream()
                .filter(Objects::nonNull)
                .filter(o -> !TERMINAL_STATUSES.contains(stringify(o.getStatus()).toLowerCase()))
                .collect(Collectors.toList());
    }

    private boolean isOverdue(ProductionOrder o) {
        return o.getPlannedEndDate() != null
            && o.getStatus() != null
            && !o.getStatus().contains("完工")
            && LocalDateTime.now().isAfter(o.getPlannedEndDate());
    }

    private double estimateCost(ProductionOrder o) {
        if (o.getFactoryUnitPrice() == null || o.getOrderQuantity() == null) return 0;
        return o.getFactoryUnitPrice().doubleValue() * o.getOrderQuantity();
    }

    private BatchStats buildBatchStats(List<ProductionOrder> orders) {
        BatchStats stats = new BatchStats();
        stats.setOrderCount(orders.size());
        double totalProgress = 0;
        double totalDaysLeft = 0;
        int dayCount = 0;
        int atRiskCount = 0;
        int overdueCount = 0;
        double totalQuantity = 0;
        double remainingQuantity = 0;
        double baseCost = 0;
        Map<String, Integer> factoryQuantities = new HashMap<>();
        for (ProductionOrder order : orders) {
            int quantity = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
            int progress = clamp(order.getProductionProgress() == null ? 0 : order.getProductionProgress(), 0, 100);
            totalQuantity += quantity;
            remainingQuantity += quantity * (100 - progress) / 100.0;
            baseCost += estimateCost(order);
            totalProgress += progress;
            if (isOverdue(order)) overdueCount++;
            if (isAtRisk(order)) atRiskCount++;
            if (order.getPlannedEndDate() != null) {
                totalDaysLeft += java.time.temporal.ChronoUnit.HOURS.between(LocalDateTime.now(), order.getPlannedEndDate()) / 24.0;
                dayCount++;
            }
            String factoryName = stringify(order.getFactoryName());
            if (!factoryName.isBlank()) {
                factoryQuantities.merge(factoryName, quantity, Integer::sum);
            }
        }
        stats.setTotalQuantity(totalQuantity);
        stats.setRemainingQuantity(Math.max(0, remainingQuantity));
        stats.setBaseCost(baseCost);
        stats.setAverageProgress(orders.isEmpty() ? 0 : totalProgress / orders.size());
        stats.setOverdueCount(overdueCount);
        stats.setAtRiskCount(atRiskCount);
        stats.setAverageDaysLeft(dayCount == 0 ? 0 : totalDaysLeft / dayCount);
        stats.setFactoryQuantities(factoryQuantities);
        stats.setFactoryNames(new ArrayList<>(factoryQuantities.keySet()));
        return stats;
    }

    private boolean isAtRisk(ProductionOrder order) {
        if (order.getPlannedEndDate() == null || isOverdue(order)) return false;
        long daysLeft = java.time.temporal.ChronoUnit.DAYS.between(LocalDateTime.now(), order.getPlannedEndDate());
        int progress = clamp(order.getProductionProgress() == null ? 0 : order.getProductionProgress(), 0, 100);
        return daysLeft <= 7 && progress < 70;
    }

    private FactoryComparison compareFactoryCapacity(BatchStats stats, String targetFactoryName) {
        FactoryComparison result = new FactoryComparison();
        double fallbackCurrentDays = stats.getRemainingQuantity() <= 0 ? 0 : Math.ceil(stats.getRemainingQuantity() / 1200.0);
        result.setCurrentLoadDays((int) Math.max(1, Math.round(resolveWeightedCurrentLoadDays(stats, fallbackCurrentDays))));
        result.setTargetLoadDays(result.getCurrentLoadDays() + 2);
        result.setRationale("未找到目标工厂产能快照，暂按保守转厂成本估算。");
        if (targetFactoryName == null || targetFactoryName.isBlank()) {
            return result;
        }
        List<FactoryCapacityOrchestrator.FactoryCapacityItem> items = factoryCapacityOrchestrator.getFactoryCapacity();
        Map<String, FactoryCapacityOrchestrator.FactoryCapacityItem> index = items == null ? Collections.emptyMap()
                : items.stream().filter(Objects::nonNull).collect(Collectors.toMap(
                        item -> stringify(item.getFactoryName()),
                        item -> item,
                        (left, right) -> left));
        FactoryCapacityOrchestrator.FactoryCapacityItem target = index.get(targetFactoryName);
        if (target == null) {
            result.setRationale("目标工厂「" + targetFactoryName + "」暂无产能快照，转厂结果按保守口径估算。");
            return result;
        }
        int targetDays = target.getEstimatedCompletionDays() > 0 ? target.getEstimatedCompletionDays() : result.getCurrentLoadDays() + 2;
        result.setTargetLoadDays(targetDays);
            result.setTargetCapacityAvailable(target.getEstimatedCompletionDays() > 0);
        result.setRationale(String.format("当前工厂负载约%d天，目标工厂「%s」负载约%d天，近30天活跃%d人，日均产量%.1f件。",
                result.getCurrentLoadDays(), targetFactoryName, targetDays,
                Math.max(0, target.getActiveWorkers()), Math.max(0, target.getAvgDailyOutput())));
        return result;
    }

    private double resolveWeightedCurrentLoadDays(BatchStats stats, double fallbackCurrentDays) {
        if (stats.getFactoryNames() == null || stats.getFactoryNames().isEmpty()) {
            return fallbackCurrentDays;
        }
        List<FactoryCapacityOrchestrator.FactoryCapacityItem> items = factoryCapacityOrchestrator.getFactoryCapacity();
        if (items == null || items.isEmpty()) {
            return fallbackCurrentDays;
        }
        Map<String, FactoryCapacityOrchestrator.FactoryCapacityItem> index = items.stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(item -> stringify(item.getFactoryName()), item -> item, (left, right) -> left));
        double totalWeight = 0;
        double totalDays = 0;
        for (String factoryName : stats.getFactoryNames()) {
            FactoryCapacityOrchestrator.FactoryCapacityItem item = index.get(factoryName);
            Integer qty = stats.getFactoryQuantities().get(factoryName);
            if (item == null || qty == null || qty <= 0 || item.getEstimatedCompletionDays() <= 0) {
                continue;
            }
            totalWeight += qty;
            totalDays += item.getEstimatedCompletionDays() * qty;
        }
        return totalWeight > 0 ? totalDays / totalWeight : fallbackCurrentDays;
    }

    private double round(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private double clampDouble(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private String stringify(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private int parseInt(Object v) {
        try { return Integer.parseInt(String.valueOf(v)); } catch (Exception e) { log.debug("[WhatIf] parseInt解析失败: v={}", v); return 0; }
    }

    private String llmSummary(WhatIfResponse.ScenarioResult baseline,
                               List<WhatIfResponse.ScenarioResult> scenarios,
                               String bestKey) {
        try {
            StringBuilder sb = new StringBuilder("[推演基准] 基准逾期风险=" + baseline.getOverdueRiskDelta() + "%\n");
            for (WhatIfResponse.ScenarioResult s : scenarios) {
                sb.append("[场景:").append(s.getScenarioKey()).append("] ")
                  .append("完工变化=").append(s.getFinishDateDeltaDays()).append("天, ")
                  .append("逾期风险变化=").append(s.getOverdueRiskDelta()).append("%, ")
                .append("成本变化=").append(s.getCostDelta()).append("元, ")
                .append("依据=").append(stringify(s.getRationale())).append("\n");
            }
            sb.append("[最优场景] ").append(bestKey);
            String systemPrompt = "你是服装供应链决策AI，根据推演数据给出最核心的1-2句综合建议，不超过100字。";
            var r = inferenceOrchestrator.chat("whatif-summary", systemPrompt, sb.toString());
            return r.isSuccess() ? r.getContent() : "请参考各场景对比选择最优方案。";
        } catch (Exception e) {
            log.warn("[WhatIf] LLM summary failed: {}", e.getMessage());
            return "请综合对比各场景的成本与逾期风险选择最优执行策略。";
        }
    }

    private WhatIfResponse errorResponse(String msg) {
        WhatIfResponse r = new WhatIfResponse(); r.setSummary(msg); return r;
    }

    @Data
    private static class BatchStats {
        private int orderCount;
        private double totalQuantity;
        private double remainingQuantity;
        private double baseCost;
        private double averageProgress;
        private int overdueCount;
        private int atRiskCount;
        private double averageDaysLeft;
        private List<String> factoryNames = new ArrayList<>();
        private Map<String, Integer> factoryQuantities = new HashMap<>();
    }

    @Data
    private static class FactoryComparison {
        private int currentLoadDays;
        private int targetLoadDays;
        private boolean targetCapacityAvailable;
        private String rationale;
    }
}
