package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.WhatIfRequest;
import com.fashion.supplychain.intelligence.dto.WhatIfResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

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

    // ──────────────────────────────────────────────────────────────────
    // 公共入口
    // ──────────────────────────────────────────────────────────────────

    public WhatIfResponse simulate(WhatIfRequest req) {
        if (req == null) return errorResponse("请求不能为空");

        Long tenantId = UserContext.tenantId();
        List<ProductionOrder> orders = fetchOrders(tenantId, req.getOrderIds());
        if (orders.isEmpty()) return errorResponse("未找到有效订单");

        // ── 基准快照
        WhatIfResponse.ScenarioResult baseline = computeBaseline(orders);

        // ── 推演各场景
        List<WhatIfResponse.ScenarioResult> scenarioResults = new ArrayList<>();
        if (req.getScenarios() != null) {
            for (Map<String, Object> s : req.getScenarios()) {
                String type = String.valueOf(s.getOrDefault("type", "UNKNOWN"));
                WhatIfResponse.ScenarioResult sr = simulateScenario(type, s, orders, baseline);
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

    private WhatIfResponse.ScenarioResult computeBaseline(List<ProductionOrder> orders) {
        int overdueCount = 0;
        double totalCost = 0;
        for (ProductionOrder o : orders) {
            if (isOverdue(o)) overdueCount++;
            totalCost += estimateCost(o);
        }
        double overdueRisk = orders.isEmpty() ? 0.0 : (double) overdueCount / orders.size() * 100;

        WhatIfResponse.ScenarioResult r = new WhatIfResponse.ScenarioResult();
        r.setScenarioKey("baseline");
        r.setDescription("当前状态（不作调整）");
        r.setFinishDateDeltaDays(0);
        r.setCostDelta(0.0);
        r.setOverdueRiskDelta(0.0);
        r.setScore(50);
        r.setAction("维持现状");
        return r;
    }

    // ──────────────────────────────────────────────────────────────────
    // 场景模拟
    // ──────────────────────────────────────────────────────────────────

    private WhatIfResponse.ScenarioResult simulateScenario(String type,
                                                            Map<String, Object> params,
                                                            List<ProductionOrder> orders,
                                                            WhatIfResponse.ScenarioResult baseline) {
        WhatIfResponse.ScenarioResult r = new WhatIfResponse.ScenarioResult();
        int value = parseInt(params.getOrDefault("value", 0));

        switch (type.toUpperCase()) {
            case "ADVANCE_DELIVERY": {
                // 提前 value 天交货：需要加快生产，成本+8%/天
                r.setScenarioKey("ADVANCE_DELIVERY_" + value + "d");
                r.setDescription("将交货期提前 " + value + " 天");
                r.setFinishDateDeltaDays(-value);
                r.setCostDelta(totalCostBase(orders) * 0.08 * value);
                r.setOverdueRiskDelta(-Math.min(30.0, value * 4.0));
                r.setScore(Math.max(10, 70 - value * 3));
                r.setAction("需增加工人加班或调配外包工序");
                break;
            }
            case "ADD_WORKERS": {
                // 增加 value 个工人：生产提速20%/人次，成本+5%/人·天
                int accelDays = (int) Math.round(value * 0.2 * 10);
                r.setScenarioKey("ADD_WORKERS_" + value + "人");
                r.setDescription("当前工厂增加 " + value + " 名工人");
                r.setFinishDateDeltaDays(-accelDays);
                r.setCostDelta(value * 200.0 * orders.size());  // 粗估：200元/人/单
                r.setOverdueRiskDelta(-(double) accelDays * 2);
                r.setScore(Math.min(90, 55 + accelDays * 2));
                r.setAction("联系工厂人事安排临时工");
                break;
            }
            case "CHANGE_FACTORY": {
                // 转厂生产：需要搬线3-5天，但新厂可能更快
                r.setScenarioKey("CHANGE_FACTORY");
                r.setDescription("将订单转至其他工厂生产");
                r.setFinishDateDeltaDays(3);     // 转厂浪费3天
                r.setCostDelta(totalCostBase(orders) * 0.15);  // 转厂成本+15%
                r.setOverdueRiskDelta(5.0);       // 短期风险略升
                r.setScore(30);
                r.setAction("仅当当前工厂严重产能不足时选择；需评估新工厂产能");
                break;
            }
            case "COST_REDUCE": {
                // 降本 value% 方案：通常牺牲一定交期安全
                r.setScenarioKey("COST_REDUCE_" + value + "pct");
                r.setDescription("目标降低成本 " + value + "%");
                r.setFinishDateDeltaDays(5);     // 降本可能带来效率损失
                r.setCostDelta(-totalCostBase(orders) * value / 100.0);
                r.setOverdueRiskDelta(value * 1.5);
                r.setScore(Math.max(20, 60 - value));
                r.setAction("在非紧急订单上使用替代物料或调整工艺");
                break;
            }
            case "DELAY_START": {
                // 延迟开工 value 天（优化排期）
                r.setScenarioKey("DELAY_START_" + value + "d");
                r.setDescription("延迟开工 " + value + " 天（腾出产线做其他急单）");
                r.setFinishDateDeltaDays(value);
                r.setCostDelta(0.0);
                r.setOverdueRiskDelta(value * 2.5);
                r.setScore(Math.max(5, 40 - value * 5));
                r.setAction("仅当交货期充裕（>14天）时可考虑");
                break;
            }
            default: {
                r.setScenarioKey(type);
                r.setDescription("未知场景类型：" + type);
                r.setScore(0);
                r.setAction("请检查 scenarioType 取值");
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
                .ne("status", "COMPLETED")
                .ne("status", "CANCELLED");
        if (orderIdsStr != null && !orderIdsStr.isBlank()) {
            qw.in("id", (Object[]) orderIdsStr.split(","));
        } else {
            qw.last("LIMIT 20");  // 默认最近20个在产订单
        }
        return productionOrderService.list(qw);
    }

    private boolean isOverdue(ProductionOrder o) {
        // 简单判断：已逾期（delivery_date < today && 非已完成）
        // 这里用 orderQuantity 的缺失作为简版逾期判断（无 deliveryDate 字段被直接暴露）
        return false;  // 占位：实际项目中接回 deliveryDate 比较
    }

    private double estimateCost(ProductionOrder o) {
        if (o.getFactoryUnitPrice() == null || o.getOrderQuantity() == null) return 0;
        return o.getFactoryUnitPrice().doubleValue() * o.getOrderQuantity();
    }

    private double totalCostBase(List<ProductionOrder> orders) {
        return orders.stream().mapToDouble(this::estimateCost).sum();
    }

    private int parseInt(Object v) {
        try { return Integer.parseInt(String.valueOf(v)); } catch (Exception e) { return 0; }
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
                  .append("成本变化=").append(s.getCostDelta()).append("元\n");
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
}
