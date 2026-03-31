package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.entity.GoalDecomposition;
import com.fashion.supplychain.intelligence.orchestration.GoalDecompositionOrchestrator;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * AI对话工具 — 目标拆解：当用户说"帮我拆解目标"、"如何达成XX"时自动分解为子目标。
 */
@Slf4j
@Component
public class GoalDecomposeTool implements AgentTool {

    @Autowired private GoalDecompositionOrchestrator goalOrchestrator;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_goal_decompose";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new HashMap<>();

        Map<String, Object> actionProp = new HashMap<>();
        actionProp.put("type", "string");
        actionProp.put("description", "操作类型：create=创建并拆解新目标, list=查看目标树");
        properties.put("action", actionProp);

        Map<String, Object> titleProp = new HashMap<>();
        titleProp.put("type", "string");
        titleProp.put("description", "目标标题，例如：本月产量提升20%、降低车缝返工率到5%以下");
        properties.put("title", titleProp);

        Map<String, Object> descProp = new HashMap<>();
        descProp.put("type", "string");
        descProp.put("description", "目标详情（可选），补充背景和约束条件");
        properties.put("description", descProp);

        Map<String, Object> typeProp = new HashMap<>();
        typeProp.put("type", "string");
        typeProp.put("description", "目标类型（可选）：production=生产, quality=质量, cost=成本, delivery=交期");
        properties.put("goalType", typeProp);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("将高层目标AI自动拆解为可执行的子目标树。"
                + "当用户说'帮我拆解目标'、'如何达成XX'、'分解任务'、'制定计划'时调用此工具。");
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

            if ("create".equals(action)) {
                String title = args.path("title").asText("").trim();
                if (title.isEmpty()) {
                    return "{\"error\": \"请提供目标标题（title）\"}";
                }
                String description = args.path("description").asText("");
                String goalType = args.path("goalType").asText("production");

                GoalDecomposition goal = goalOrchestrator.createAndDecompose(
                        goalType, title, description, null, null, null, null);

                // 查询完整子目标树
                List<GoalDecomposition> tree = goalOrchestrator.listGoalTree(UserContext.tenantId());
                List<Map<String, Object>> subGoals = new ArrayList<>();
                for (GoalDecomposition g : tree) {
                    if (goal.getId().equals(g.getParentGoalId())) {
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("title", g.getTitle());
                        m.put("priority", g.getPriority());
                        m.put("status", g.getStatus());
                        subGoals.add(m);
                    }
                }

                Map<String, Object> result = new LinkedHashMap<>();
                result.put("goalId", goal.getId());
                result.put("title", goal.getTitle());
                result.put("subGoalCount", subGoals.size());
                result.put("subGoals", subGoals);
                return OBJECT_MAPPER.writeValueAsString(result);
            } else {
                Long tenantId = UserContext.tenantId();
                List<GoalDecomposition> tree = goalOrchestrator.listGoalTree(tenantId);
                List<Map<String, Object>> items = new ArrayList<>();
                for (GoalDecomposition g : tree) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", g.getId());
                    m.put("title", g.getTitle());
                    m.put("type", g.getGoalType());
                    m.put("progress", g.getProgress());
                    m.put("status", g.getStatus());
                    m.put("isSubGoal", g.getParentGoalId() != null);
                    items.add(m);
                }
                return OBJECT_MAPPER.writeValueAsString(Map.of("count", items.size(), "goals", items));
            }
        } catch (Exception e) {
            log.warn("[GoalTool] 执行失败: {}", e.getMessage());
            return "{\"error\": \"目标拆解执行失败: " + e.getMessage() + "\"}";
        }
    }
}
