package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.entity.PatternDiscovery;
import com.fashion.supplychain.intelligence.orchestration.PatternDiscoveryOrchestrator;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * AI对话工具 — 规律发现：当用户询问"有什么规律"、"趋势分析"时从历史日志挖掘模式。
 */
@Slf4j
@Component
public class PatternDiscoveryTool implements AgentTool {

    @Autowired private PatternDiscoveryOrchestrator patternOrchestrator;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_pattern_discovery";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new HashMap<>();

        Map<String, Object> actionProp = new HashMap<>();
        actionProp.put("type", "string");
        actionProp.put("description", "操作类型：discover=挖掘新规律, list=查看已有规律");
        properties.put("action", actionProp);

        Map<String, Object> daysProp = new HashMap<>();
        daysProp.put("type", "integer");
        daysProp.put("description", "回溯天数（默认30），discover模式下分析最近N天的数据");
        properties.put("lookbackDays", daysProp);

        Map<String, Object> typeProp = new HashMap<>();
        typeProp.put("type", "string");
        typeProp.put("description", "规律类型过滤（可选）：recurring=重复模式, anomaly=异常, trend=趋势");
        properties.put("patternType", typeProp);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("从历史Agent执行日志中发现业务规律和异常趋势。"
                + "当用户问'有什么规律'、'趋势是什么'、'分析一下最近的模式'、'哪些异常反复出现'时调用此工具。");
        AiTool.AiParameters aiParams = new AiTool.AiParameters();
        aiParams.setProperties(properties);
        aiParams.setRequired(List.of("action"));
        function.setParameters(aiParams);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) {
        try {
            JsonNode args = OBJECT_MAPPER.readTree(argumentsJson);
            String action = args.path("action").asText("list");
            int lookbackDays = args.path("lookbackDays").asInt(30);

            if ("discover".equals(action)) {
                TenantAssert.assertTenantContext();
                List<PatternDiscovery> patterns = patternOrchestrator.discoverPatterns(lookbackDays);
                List<Map<String, Object>> items = new ArrayList<>();
                for (PatternDiscovery p : patterns) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("name", p.getPatternName());
                    m.put("type", p.getPatternType());
                    m.put("description", p.getDescription());
                    m.put("confidence", p.getConfidence());
                    m.put("impact", p.getImpactScore());
                    items.add(m);
                }
                return OBJECT_MAPPER.writeValueAsString(Map.of("action", "discover", "found", items.size(), "patterns", items));
            } else {
                String patternType = args.path("patternType").asText(null);
                TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
                List<PatternDiscovery> patterns = patternOrchestrator.listByTenant(tenantId, patternType, 10);
                List<Map<String, Object>> items = new ArrayList<>();
                for (PatternDiscovery p : patterns) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", p.getId());
                    m.put("name", p.getPatternName());
                    m.put("type", p.getPatternType());
                    m.put("description", p.getDescription());
                    m.put("confidence", p.getConfidence());
                    m.put("status", p.getStatus());
                    items.add(m);
                }
                return OBJECT_MAPPER.writeValueAsString(Map.of("action", "list", "count", items.size(), "patterns", items));
            }
        } catch (Exception e) {
            log.warn("[PatternTool] 执行失败: {}", e.getMessage());
            return "{\"error\": \"规律发现执行失败: " + e.getMessage() + "\"}";
        }
    }
}
