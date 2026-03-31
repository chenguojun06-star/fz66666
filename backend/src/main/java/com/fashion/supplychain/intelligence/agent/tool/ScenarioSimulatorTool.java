package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.WhatIfRequest;
import com.fashion.supplychain.intelligence.dto.WhatIfResponse;
import com.fashion.supplychain.intelligence.orchestration.WhatIfSimulationOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 蒙特卡洛多场景模拟工具 — Monte Carlo Scenario Simulator
 *
 * <p>与 {@link WhatIfSimulationTool}（单场景单次）不同：
 * 本工具对同一场景重复运行 N 次（每次在 shock_value ±30% 范围内随机抖动），
 * 统计 P50/P90 风险分位数，输出概率分布摘要与最优建议。
 *
 * <p>典型应用：
 * <ul>
 *   <li>关税上涨 10%，跑 50 次 → 查看成本增量的 P90 上界</li>
 *   <li>汇率波动 ±5%，订单利润如何分布</li>
 *   <li>交货期压缩 3 天，完工延期概率有多高</li>
 * </ul>
 */
@Slf4j
@Component
public class ScenarioSimulatorTool implements AgentTool {

    @Autowired
    private WhatIfSimulationOrchestrator whatIfOrchestrator;

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_ITERATIONS = 200;
    private static final double JITTER_RATIO = 0.30;   // ±30% 随机抖动

    @Override
    public String getName() {
        return "tool_scenario_simulator";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("scenario_type", prop("string",
                "场景类型：TARIFF_HIKE=关税上涨, EXCHANGE_RATE=汇率变动, "
                        + "DELIVERY_SHOCK=交期冲击, COST_SPIKE=成本骤增, ADVANCE_DELIVERY=提前交货"));
        props.put("shock_value", prop("number",
                "冲击数值（正数）。如关税上涨 10%=10, 交期压缩 3 天=3"));
        props.put("iterations", prop("integer",
                "蒙特卡洛运行次数，默认 50，最大 200"));
        props.put("order_ids", prop("string",
                "目标订单 ID（逗号分隔），为空则对全部在产订单模拟"));

        AiTool tool = new AiTool();
        AiTool.AiFunction fn = new AiTool.AiFunction();
        fn.setName(getName());
        fn.setDescription("蒙特卡洛多场景模拟：对关税、汇率、交期、成本冲击运行 N 次随机抖动仿真，"
                + "输出 P50/P90 风险分位数与最优应对建议。"
                + "当用户问\u300c如果关税涨X%会怎样\u300d\u300c在最坏情况下成本增多少\u300d\u300c交期压Y天的概率分布\u300d时调用。");
        AiTool.AiParameters params = new AiTool.AiParameters();
        params.setProperties(props);
        params.setRequired(List.of("scenario_type", "shock_value"));
        fn.setParameters(params);
        tool.setFunction(fn);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        JsonNode args = JSON.readTree(argumentsJson);
        String scenarioType = args.path("scenario_type").asText("ADVANCE_DELIVERY").trim().toUpperCase();
        double shockValue = args.path("shock_value").asDouble(3.0);
        int iterations = Math.min(args.path("iterations").asInt(50), MAX_ITERATIONS);
        String orderIds = args.path("order_ids").asText("").trim();

        // 映射到 WhatIfRequest 支持的类型
        String whatIfType = mapToWhatIfType(scenarioType);

        log.info("[ScenarioSim] type={} shock={} runs={} orders={}",
                scenarioType, shockValue, iterations, orderIds.isEmpty() ? "全部" : orderIds);

        List<Double> costDeltas = new ArrayList<>(iterations);
        List<Integer> riskDeltas = new ArrayList<>(iterations);
        int successRuns = 0;

        for (int i = 0; i < iterations; i++) {
            double jitter = 1.0 + (ThreadLocalRandom.current().nextDouble(-JITTER_RATIO, JITTER_RATIO));
            int jitteredValue = (int) Math.max(1, Math.round(shockValue * jitter));

            WhatIfRequest req = buildRequest(orderIds, whatIfType, jitteredValue);
            try {
                WhatIfResponse resp = whatIfOrchestrator.simulate(req);
                if (resp != null && resp.getScenarios() != null && !resp.getScenarios().isEmpty()) {
                    WhatIfResponse.ScenarioResult first = resp.getScenarios().get(0);
                    costDeltas.add(first.getCostDelta() != null ? first.getCostDelta() : 0.0);
                    riskDeltas.add(first.getOverdueRiskDelta() != null ? (int) Math.round(first.getOverdueRiskDelta()) : 0);
                    successRuns++;
                }
            } catch (Exception e) {
                log.debug("[ScenarioSim] run {} 失败（跳过）: {}", i, e.getMessage());
            }
        }

        return buildResult(scenarioType, shockValue, iterations, successRuns, costDeltas, riskDeltas);
    }

    // ── 私有辅助 ────────────────────────────────────────────────────────

    private String mapToWhatIfType(String type) {
        return switch (type) {
            case "TARIFF_HIKE", "COST_SPIKE" -> "COST_REDUCE";   // 反向减少 = 成本上升
            case "DELIVERY_SHOCK" -> "ADVANCE_DELIVERY";
            case "EXCHANGE_RATE" -> "COST_REDUCE";
            default -> type;
        };
    }

    private WhatIfRequest buildRequest(String orderIds, String type, int value) {
        WhatIfRequest req = new WhatIfRequest();
        req.setOrderIds(orderIds);
        Map<String, Object> scenario = new LinkedHashMap<>();
        scenario.put("type", type);
        scenario.put("value", value);
        req.setScenarios(List.of(scenario));
        return req;
    }

    private String buildResult(String type, double shock, int total, int success,
                                List<Double> costDeltas, List<Integer> riskDeltas) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("scenario_type", type);
        out.put("shock_value", shock);
        out.put("scenarios_ran", total);
        out.put("successful_runs", success);

        if (!costDeltas.isEmpty()) {
            Collections.sort(costDeltas);
            out.put("cost_delta_p50", round(percentile(costDeltas, 50)));
            out.put("cost_delta_p90", round(percentile(costDeltas, 90)));
            out.put("cost_delta_avg", round(costDeltas.stream().mapToDouble(d -> d).average().orElse(0)));
        }
        if (!riskDeltas.isEmpty()) {
            Collections.sort(riskDeltas, Comparator.comparingInt(i -> i));
            out.put("risk_p90", riskDeltas.get((int) (riskDeltas.size() * 0.9)));
        }
        out.put("recommended_action", buildRecommendation(type, shock, costDeltas, riskDeltas));
        try { return JSON.writeValueAsString(out); } catch (Exception e) { return out.toString(); }
    }

    private double percentile(List<Double> sorted, int p) {
        int idx = (int) Math.ceil(p / 100.0 * sorted.size()) - 1;
        return sorted.get(Math.max(0, Math.min(idx, sorted.size() - 1)));
    }

    private double round(double v) { return Math.round(v * 100.0) / 100.0; }

    private String buildRecommendation(String type, double shock,
                                        List<Double> costDeltas, List<Integer> riskDeltas) {
        double p90Cost = costDeltas.isEmpty() ? 0 : percentile(costDeltas, 90);
        int p90Risk = riskDeltas.isEmpty() ? 0 : riskDeltas.get((int) (riskDeltas.size() * 0.9));
        if (p90Risk > 50 || p90Cost > 10000) {
            return String.format("高风险场景：%s 冲击%.1f 时 P90 风险偏高，建议提前锁定供应商价格或储备缓冲库存。", type, shock);
        }
        return String.format("%s 冲击%.1f 在蒙特卡洛模拟中整体可控，P90 成本增量约 %.1f，可按计划推进。", type, shock, p90Cost);
    }

    private Map<String, Object> prop(String type, String desc) {
        return Map.of("type", type, "description", desc);
    }
}
