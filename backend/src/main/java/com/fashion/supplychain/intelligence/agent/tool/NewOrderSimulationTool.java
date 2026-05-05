package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.orchestration.AiSandboxOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 空降新订单推演沙盘工具 — 激活 AiSandboxOrchestrator
 * 当用户问：“如果现在接一个 5000 件的急单，几天能做完？哪个工厂产能最合适？”
 */
@Slf4j
@Component
public class NewOrderSimulationTool extends AbstractAgentTool {

    @Autowired
    private AiSandboxOrchestrator sandboxOrchestrator;

    private static final ObjectMapper JSON = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_simulate_new_order";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("quantity", prop("integer", "假设接入的全新订单件数。例如用户提问‘如果接5000件急单’，此值为5000。"));

        AiTool tool = new AiTool();
        AiTool.AiFunction fn = new AiTool.AiFunction();
        fn.setName(getName());
        fn.setDescription("处理用户咨询未知/全新假设订单的接单评估和产能推演。分析哪个工厂最适合接单、接该单后会导致完工时间延长几天。当用户问‘如果加塞X件新单’‘模拟接单XXX件’时调用此工具。");
        AiTool.AiParameters params = new AiTool.AiParameters();
        params.setProperties(props);
        params.setRequired(List.of("quantity"));
        fn.setParameters(params);
        tool.setFunction(fn);
        return tool;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        try {
            JsonNode args = JSON.readTree(argumentsJson);
            int quantity = args.path("quantity").asInt(1000);

            log.info("[NewOrderSimulationTool] 执行沙盘推演，假设数量={}", quantity);
            return sandboxOrchestrator.simulateNewOrder(quantity);
        } catch (Exception e) {
            log.error("[NewOrderSimulationTool] 模拟推演失败", e);
            return "{\"error\": \"新订单沙盘推演失败: " + e.getMessage() + "\"}";
        }
    }

}
