package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.GraphExecutionResult;
import com.fashion.supplychain.intelligence.dto.MultiAgentRequest;
import com.fashion.supplychain.intelligence.orchestration.MultiAgentGraphOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * 多智能体协同图谱工具 — 激活 MultiAgentGraphOrchestrator (Hybrid Graph MAS v4.1)
 * 流程：DigitalTwin快照 → Supervisor路由 → 4专家并行（排产/采购/合规/物流）→ Reflection整合
 * 适合："全面分析所有订单"、"我最需要关注什么"等需要多维视角的复杂宏观决策。
 */
@Slf4j
@Component
public class MultiAgentTool implements AgentTool {

    @Autowired
    private MultiAgentGraphOrchestrator multiAgentGraph;

    private static final ObjectMapper JSON = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_multi_agent";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();

        Map<String, Object> sceneProp = new HashMap<>();
        sceneProp.put("type", "string");
        sceneProp.put("description",
                "分析场景：delivery_risk=货期风险，sourcing=采购供应链，compliance=合规，logistics=物流优化，full=全面综合（默认）");
        props.put("scene", sceneProp);

        Map<String, Object> questionProp = new HashMap<>();
        questionProp.put("type", "string");
        questionProp.put("description", "用户核心问题，如：哪些订单需要紧急处理？如何优化本月交期？");
        props.put("question", questionProp);

        Map<String, Object> orderIdsProp = new HashMap<>();
        orderIdsProp.put("type", "string");
        orderIdsProp.put("description", "订单ID列表（逗号分隔），为空则分析所有进行中订单");
        props.put("order_ids", orderIdsProp);

        AiTool tool = new AiTool();
        AiTool.AiFunction fn = new AiTool.AiFunction();
        fn.setName(getName());
        fn.setDescription("启动多智能体协同图谱（排产+采购+合规+物流专家并行分析，反思引擎整合）。"
                + "适合复杂全局决策：当用户说全面分析、综合评估所有订单、我现在最需要关注什么、给我系统性建议时调用。"
                + "执行时间约10-30秒，返回多维度系统性报告。");
        AiTool.AiParameters aiParams = new AiTool.AiParameters();
        aiParams.setProperties(props);
        aiParams.setRequired(List.of()); // 无必填参数，默认分析全部订单
        fn.setParameters(aiParams);
        tool.setFunction(fn);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) {
        try {
            JsonNode args = JSON.readTree(argumentsJson);
            MultiAgentRequest req = new MultiAgentRequest();
            req.setScene(args.path("scene").asText("full").trim());
            req.setQuestion(args.path("question").asText("").trim());

            String orderIdsStr = args.path("order_ids").asText("").trim();
            if (!orderIdsStr.isEmpty()) {
                req.setOrderIds(Arrays.asList(orderIdsStr.split(",")));
            }

            log.info("[MultiAgentTool] 启动多智能体图谱，场景={}, 问题={}", req.getScene(), req.getQuestion());

            GraphExecutionResult result = multiAgentGraph.runGraph(req);

            // 精简返回：保留最有价值的4个字段，避免超长JSON
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("route", result.getRoute());
            resp.put("reflection", result.getReflection());
            resp.put("optimization", result.getOptimizationSuggestion());
            resp.put("context", result.getContextSummary());
            // 专家报告：各专家键-值摘要（排产/采购/合规/物流）
            if (result.getSpecialistResults() != null && !result.getSpecialistResults().isEmpty()) {
                resp.put("specialists", result.getSpecialistResults());
            }
            resp.put("executionId", result.getExecutionId());
            return JSON.writeValueAsString(resp);

        } catch (Exception e) {
            log.error("[MultiAgentTool] 多智能体图执行失败", e);
            return "{\"error\": \"多智能体分析失败: " + e.getMessage() + "\"}";
        }
    }
}
