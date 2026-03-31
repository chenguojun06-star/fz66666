package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.system.entity.ChangeApproval;
import com.fashion.supplychain.system.orchestration.ChangeApprovalOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 变更审批工具 — 让管理者通过小云AI对话直接审批/驳回申请
 * 支持操作：list_pending(查看待审批列表), approve(通过), reject(驳回)
 */
@Slf4j
@Component
public class ChangeApprovalTool implements AgentTool {

    @Autowired
    private ChangeApprovalOrchestrator changeApprovalOrchestrator;

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("MM-dd HH:mm");

    @Override
    public String getName() {
        return "tool_change_approval";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> action = new LinkedHashMap<>();
        action.put("type", "string");
        action.put("description", "操作类型：list_pending(查看待我审批的申请列表), approve(审批通过), reject(驳回申请)");
        properties.put("action", action);

        Map<String, Object> approvalId = new LinkedHashMap<>();
        approvalId.put("type", "string");
        approvalId.put("description", "审批记录ID（approve/reject 必填）");
        properties.put("approvalId", approvalId);

        Map<String, Object> remark = new LinkedHashMap<>();
        remark.put("type", "string");
        remark.put("description", "审批备注或驳回原因（reject 时建议填写）");
        properties.put("remark", remark);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("变更审批工具。当用户问'有什么待审批的'、'帮我看看审批'、'通过那个删除订单的申请'时调用。" +
                "支持查看待审批列表、审批通过、驳回申请。");

        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of("action"));
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        Map<String, Object> args = MAPPER.readValue(argumentsJson, new TypeReference<>() {});
        String action = (String) args.get("action");

        if (action == null) {
            return "{\"error\": \"缺少 action 参数\"}";
        }

        switch (action) {
            case "list_pending":
                return handleListPending();
            case "approve":
                return handleApprove(args);
            case "reject":
                return handleReject(args);
            default:
                return "{\"error\": \"未知操作: " + action + "，支持 list_pending/approve/reject\"}";
        }
    }

    private String handleListPending() throws Exception {
        IPage<ChangeApproval> page = changeApprovalOrchestrator.listPendingForMe(1, 20);
        List<ChangeApproval> records = page.getRecords();

        if (records.isEmpty()) {
            return MAPPER.writeValueAsString(Map.of(
                    "total", 0,
                    "message", "当前没有待审批的申请"
            ));
        }

        List<Map<String, String>> items = new ArrayList<>();
        for (ChangeApproval r : records) {
            Map<String, String> item = new LinkedHashMap<>();
            item.put("id", r.getId());
            item.put("type", labelForType(r.getOperationType()));
            item.put("targetNo", r.getTargetNo() != null ? r.getTargetNo() : r.getTargetId());
            item.put("applicant", r.getApplicantName());
            item.put("reason", r.getApplyReason() != null ? r.getApplyReason() : "");
            item.put("applyTime", r.getApplyTime() != null ? r.getApplyTime().format(FMT) : "");
            items.add(item);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", page.getTotal());
        result.put("items", items);
        return MAPPER.writeValueAsString(result);
    }

    private String handleApprove(Map<String, Object> args) throws Exception {
        String id = (String) args.get("approvalId");
        if (id == null || id.isBlank()) {
            return "{\"error\": \"缺少 approvalId 参数\"}";
        }
        String remark = (String) args.get("remark");
        Map<String, Object> result = changeApprovalOrchestrator.approve(id, remark);
        return MAPPER.writeValueAsString(result);
    }

    private String handleReject(Map<String, Object> args) throws Exception {
        String id = (String) args.get("approvalId");
        if (id == null || id.isBlank()) {
            return "{\"error\": \"缺少 approvalId 参数\"}";
        }
        String reason = (String) args.get("remark");
        changeApprovalOrchestrator.reject(id, reason);
        return MAPPER.writeValueAsString(Map.of("success", true, "message", "已驳回该申请"));
    }

    private String labelForType(String type) {
        if (type == null) return "未知";
        switch (type) {
            case "ORDER_DELETE": return "删除订单";
            case "ORDER_SCRAP": return "报废订单";
            case "DATA_MODIFY": return "修改数据";
            default: return type;
        }
    }
}
