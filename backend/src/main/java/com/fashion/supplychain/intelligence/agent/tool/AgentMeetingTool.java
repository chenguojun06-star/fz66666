package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.entity.AgentMeeting;
import com.fashion.supplychain.intelligence.orchestration.AgentMeetingOrchestrator;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * AI对话工具 — Agent例会：当用户说"开个例会讨论"、"多角度分析"时召集多Agent辩论。
 */
@Slf4j
@Component
public class AgentMeetingTool implements AgentTool {

    @Autowired private AgentMeetingOrchestrator meetingOrchestrator;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_agent_meeting";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new HashMap<>();

        Map<String, Object> actionProp = new HashMap<>();
        actionProp.put("type", "string");
        actionProp.put("description", "操作类型：hold=召开新例会, list=查看历史例会");
        properties.put("action", actionProp);

        Map<String, Object> topicProp = new HashMap<>();
        topicProp.put("type", "string");
        topicProp.put("description", "会议议题，例如：本周生产瓶颈如何解决、订单PO20260301延期对策");
        properties.put("topic", topicProp);

        Map<String, Object> typeProp = new HashMap<>();
        typeProp.put("type", "string");
        typeProp.put("description", "会议类型（可选）：daily=日常例会, emergency=紧急会议, review=复盘会");
        properties.put("meetingType", typeProp);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("召集多个AI Agent开例会讨论议题，通过辩论达成共识和行动计划。"
                + "当用户说'开个例会'、'多角度分析一下'、'集体讨论'、'AI辩论'时调用此工具。");
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

            if ("hold".equals(action)) {
                String topic = args.path("topic").asText("").trim();
                if (topic.isEmpty()) {
                    return "{\"error\": \"请提供会议议题（topic）\"}";
                }
                String meetingType = args.path("meetingType").asText("daily");

                AgentState state = new AgentState();
                state.setTenantId(UserContext.tenantId());
                state.setScene("meeting");
                state.setQuestion(topic);

                AgentMeeting meeting = meetingOrchestrator.holdMeeting(meetingType, topic, state);

                Map<String, Object> result = new LinkedHashMap<>();
                result.put("meetingId", meeting.getId());
                result.put("topic", meeting.getTopic());
                result.put("consensus", meeting.getConsensus());
                result.put("dissent", meeting.getDissent());
                result.put("actionItems", meeting.getActionItems());
                result.put("confidenceScore", meeting.getConfidenceScore());
                result.put("durationMs", meeting.getDurationMs());
                return OBJECT_MAPPER.writeValueAsString(result);
            } else {
                TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
                List<AgentMeeting> meetings = meetingOrchestrator.listByTenant(tenantId, 5);
                List<Map<String, Object>> items = new ArrayList<>();
                for (AgentMeeting m : meetings) {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", m.getId());
                    item.put("type", m.getMeetingType());
                    item.put("topic", m.getTopic());
                    item.put("consensus", m.getConsensus());
                    item.put("confidence", m.getConfidenceScore());
                    item.put("time", m.getCreateTime() != null ? m.getCreateTime().toString() : "");
                    items.add(item);
                }
                return OBJECT_MAPPER.writeValueAsString(Map.of("count", items.size(), "meetings", items));
            }
        } catch (Exception e) {
            log.warn("[MeetingTool] 执行失败: {}", e.getMessage());
            return "{\"error\": \"Agent例会执行失败: " + e.getMessage() + "\"}";
        }
    }
}
