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

/**
 * What-If 推演沙盘工具 — 激活 WhatIfSimulationOrchestrator
 * 场景：提前交货 / 换工厂 / 加工人 / 降成本 / 推迟开工
 * AI 通过此工具对任意订单运行"如果X会怎样"多方案对比，返回完工日变化、成本增减、逾期风险改变及最优建议。
 */
@Slf4j
@Component
public class WhatIfSimulationTool implements AgentTool {

    @Autowired
    private WhatIfSimulationOrchestrator whatIfOrchestrator;

    private static final ObjectMapper JSON = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_whatif";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("scenario_type", prop("string",
                "推演场景类型：ADVANCE_DELIVERY=提前交货，CHANGE_FACTORY=换工厂，ADD_WORKERS=加工人，COST_REDUCE=降成本，DELAY_START=推迟开工"));
        props.put("scenario_value", prop("integer",
                "场景数值：提前/推迟天数或人数。如 scenario_type=ADVANCE_DELIVERY, scenario_value=3 表示提前3天交货"));
        props.put("order_ids", prop("string",
                "订单ID列表（逗号分隔），为空则对所有进行中订单推演"));
        props.put("factory_id", prop("string",
                "目标工厂ID，仅 CHANGE_FACTORY 场景时需要"));

        AiTool tool = new AiTool();
        AiTool.AiFunction fn = new AiTool.AiFunction();
        fn.setName(getName());
        fn.setDescription("运行\"如果X会怎样\"推演沙盘：分析提前交货/换工厂/加工人/降成本/推迟开工等决策对完工日、成本、逾期风险的影响，并给出最优策略建议。"
                + "当用户说如果提前X天、换到XX工厂会怎样、加X个工人、如果推迟开工时调用此工具。");
        AiTool.AiParameters params = new AiTool.AiParameters();
        params.setProperties(props);
        params.setRequired(List.of("scenario_type", "scenario_value"));
        fn.setParameters(params);
        tool.setFunction(fn);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) {
        try {
            JsonNode args = JSON.readTree(argumentsJson);
            String scenarioType = args.path("scenario_type").asText("ADVANCE_DELIVERY").trim().toUpperCase();
            int scenarioValue = args.path("scenario_value").asInt(3);
            String orderIds = args.path("order_ids").asText("").trim();
            String factoryId = args.path("factory_id").asText("").trim();

            WhatIfRequest req = new WhatIfRequest();
            req.setOrderIds(orderIds);

            Map<String, Object> scenario = new LinkedHashMap<>();
            scenario.put("type", scenarioType);
            scenario.put("value", scenarioValue);
            if (!factoryId.isEmpty()) scenario.put("factoryId", factoryId);
            req.setScenarios(List.of(scenario));

            log.info("[WhatIfTool] 推演场景={}, 值={}, 订单={}", scenarioType, scenarioValue,
                    orderIds.isEmpty() ? "全部" : orderIds);

            WhatIfResponse resp = whatIfOrchestrator.simulate(req);

            // 精简返回：AI侧重摘要 + 各方案对比数字
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("summary", resp.getSummary());
            result.put("recommended", resp.getRecommendedScenario());
            if (resp.getBaseline() != null) {
                result.put("baseline", summarize(resp.getBaseline()));
            }
            if (resp.getScenarios() != null) {
                List<Map<String, Object>> list = new ArrayList<>();
                for (WhatIfResponse.ScenarioResult s : resp.getScenarios()) {
                    list.add(summarize(s));
                }
                result.put("scenarios", list);
            }
            return JSON.writeValueAsString(result);

        } catch (Exception e) {
            log.error("[WhatIfTool] 推演异常", e);
            return "{\"error\": \"推演沙盘执行失败: " + e.getMessage() + "\"}";
        }
    }

    private Map<String, Object> summarize(WhatIfResponse.ScenarioResult s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("key", s.getScenarioKey());
        m.put("desc", s.getDescription());
        m.put("finishDeltaDays", s.getFinishDateDeltaDays()); // 负=提前，正=推迟
        m.put("costDelta", s.getCostDelta());                 // 负=降低，正=增加
        m.put("riskDelta", s.getOverdueRiskDelta());          // 负=好转，正=恶化
        m.put("score", s.getScore());                          // 0-100，越高越好
        m.put("action", s.getAction());
        return m;
    }

    private Map<String, Object> prop(String type, String desc) {
        Map<String, Object> p = new HashMap<>();
        p.put("type", type);
        p.put("description", desc);
        return p;
    }
}
