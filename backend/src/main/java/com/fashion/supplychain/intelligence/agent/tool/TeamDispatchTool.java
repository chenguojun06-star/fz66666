package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.CollaborationDispatchRequest;
import com.fashion.supplychain.intelligence.dto.CollaborationDispatchResponse;
import com.fashion.supplychain.intelligence.orchestration.CollaborationDispatchOrchestrator;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class TeamDispatchTool implements AgentTool {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Autowired
    private CollaborationDispatchOrchestrator collaborationDispatchOrchestrator;
    @Autowired
    private AiAgentToolAccessService toolAccessService;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", schema("string", "动作: dispatch | query_status | list_tasks | accept_task | start_task | complete_task；默认 dispatch"));
        properties.put("instruction", schema("string", "需要派发给同事执行的任务说明，例如“请今天内跟进 PO20260318 的交期并回复风险”"));
        properties.put("orderNo", schema("string", "关联订单号，可选"));
        properties.put("targetRole", schema("string", "目标岗位，可选：跟单、生产主管、采购、财务、仓库、质检"));
        properties.put("targetUser", schema("string", "指定人员姓名或账号，可选"));
        properties.put("title", schema("string", "通知标题，可选"));
        properties.put("content", schema("string", "通知正文，可选；不传则系统自动生成"));
        properties.put("dueHint", schema("string", "时效要求，可选，例如“1小时内反馈”"));
        properties.put("remark", schema("string", "接单、处理中、完成时的回写说明，可选"));
        properties.put("limit", schema("integer", "查询任务列表时返回条数，默认 10"));

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("把任务分派给真实员工处理。会自动识别责任岗位、匹配系统内人员并发送站内通知。"
                + "也支持查询协同状态、接单、开始处理、完成回写。当用户说“通知跟单跟进”“安排采购处理缺料”“找财务确认回款”“帮我找人处理这单”“谁在处理这单”“我接单了”“我处理完成了”时调用。");
        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        if (UserContext.tenantId() == null) {
            return "{\"success\":false,\"error\":\"租户上下文丢失，请重新登录\"}";
        }
        log.info("Tool: {} called with args: {}", getName(), argumentsJson);
        Map<String, Object> args = OBJECT_MAPPER.readValue(
                argumentsJson == null || argumentsJson.isBlank() ? "{}" : argumentsJson,
                new TypeReference<Map<String, Object>>() {});
        String action = asString(args.get("action"));
        boolean isWriteAction = !"query_status".equalsIgnoreCase(action) && !"list_tasks".equalsIgnoreCase(action);
        if (isWriteAction && !toolAccessService.hasManagerAccess()) {
            return "{\"success\":false,\"error\":\"派单/接单/完成任务需要管理员权限\"}";
        }
        if ("query_status".equalsIgnoreCase(action)) {
            CollaborationDispatchResponse response = collaborationDispatchOrchestrator.queryStatus(
                    asString(args.get("orderNo")),
                    asString(args.get("targetRole")));
            return OBJECT_MAPPER.writeValueAsString(response);
        }
        if ("list_tasks".equalsIgnoreCase(action)) {
            return OBJECT_MAPPER.writeValueAsString(collaborationDispatchOrchestrator.listTasks(
                    asString(args.get("orderNo")),
                    asString(args.get("targetRole")),
                    asInt(args.get("limit"), 10)));
        }
        if ("accept_task".equalsIgnoreCase(action) || "start_task".equalsIgnoreCase(action) || "complete_task".equalsIgnoreCase(action)) {
            CollaborationDispatchResponse response = collaborationDispatchOrchestrator.updateStatus(
                    asString(args.get("orderNo")),
                    asString(args.get("targetRole")),
                    asString(args.get("targetUser")),
                    action,
                    asString(args.get("remark")));
            return OBJECT_MAPPER.writeValueAsString(response);
        }
        CollaborationDispatchRequest request = new CollaborationDispatchRequest();
        request.setInstruction(asString(args.get("instruction")));
        request.setOrderNo(asString(args.get("orderNo")));
        request.setTargetRole(asString(args.get("targetRole")));
        request.setTargetUser(asString(args.get("targetUser")));
        request.setTitle(asString(args.get("title")));
        request.setContent(asString(args.get("content")));
        request.setDueHint(asString(args.get("dueHint")));

        CollaborationDispatchResponse response = collaborationDispatchOrchestrator.dispatch(request);
        return OBJECT_MAPPER.writeValueAsString(response);
    }

    @Override
    public String getName() {
        return "tool_team_dispatch";
    }

    private Map<String, Object> schema(String type, String description) {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", type);
        schema.put("description", description);
        return schema;
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value).trim();
    }

    private int asInt(Object value, int defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (Exception e) {
            return defaultValue;
        }
    }
}
