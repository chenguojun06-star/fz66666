package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.entity.RootCauseAnalysis;
import com.fashion.supplychain.intelligence.orchestration.RootCauseAnalysisOrchestrator;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * AI对话工具 — 根因分析：当用户询问"为什么XX出问题"、"原因分析"时自动触发5-Why根因分析。
 */
@Slf4j
@Component
public class RcaAnalysisTool implements AgentTool {

    @Autowired private RootCauseAnalysisOrchestrator rcaOrchestrator;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_root_cause_analysis";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new HashMap<>();

        Map<String, Object> descProp = new HashMap<>();
        descProp.put("type", "string");
        descProp.put("description", "问题描述，例如：订单PO20260301延期一周、车缝工序频繁返工、面料损耗率超标");
        properties.put("description", descProp);

        Map<String, Object> typeProp = new HashMap<>();
        typeProp.put("type", "string");
        typeProp.put("description", "触发类型（可选）：manual=手动发起, alert=巡检预警, reflection=反思触发");
        properties.put("triggerType", typeProp);

        Map<String, Object> orderProp = new HashMap<>();
        orderProp.put("type", "string");
        orderProp.put("description", "关联订单号（可选，逗号分隔），例如 PO20260301001,PO20260301002");
        properties.put("linkedOrderIds", orderProp);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("对生产问题进行5-Why根因分析，找出根本原因并生成鱼骨图分类。"
                + "当用户问'为什么XX出问题'、'原因是什么'、'怎么会这样'、'根因分析'时调用此工具。");
        AiTool.AiParameters aiParams = new AiTool.AiParameters();
        aiParams.setProperties(properties);
        aiParams.setRequired(List.of("description"));
        function.setParameters(aiParams);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) {
        try {
            JsonNode args = OBJECT_MAPPER.readTree(argumentsJson);
            String description = args.path("description").asText("").trim();
            String triggerType = args.path("triggerType").asText("manual");
            String linkedOrderIds = args.path("linkedOrderIds").asText("");

            if (description.isEmpty()) {
                return "{\"error\": \"请提供问题描述\"}";
            }

            RootCauseAnalysis rca = rcaOrchestrator.analyze(triggerType, description, linkedOrderIds);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("id", rca.getId());
            result.put("rootCause", rca.getRootCause());
            result.put("category", rca.getRootCauseCategory());
            result.put("severity", rca.getSeverity());
            result.put("whyChain", rca.getWhyChain());
            result.put("suggestedActions", rca.getSuggestedActions());
            return OBJECT_MAPPER.writeValueAsString(result);
        } catch (Exception e) {
            log.warn("[RcaTool] 执行失败: {}", e.getMessage());
            return "{\"error\": \"根因分析执行失败: " + e.getMessage() + "\"}";
        }
    }
}
