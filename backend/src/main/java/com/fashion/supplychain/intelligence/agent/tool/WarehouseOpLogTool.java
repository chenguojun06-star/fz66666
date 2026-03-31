package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.entity.IntelligenceAuditLog;
import com.fashion.supplychain.intelligence.mapper.IntelligenceAuditLogMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.stream.Collectors;

/**
 * AI小云工具：仓库操作日志查询
 * <p>
 * 查询样衣借调/归还、成品出库的历史审计记录，支持按操作人、操作类型、时间范围过滤。
 * 安全：外发工厂账号不可查询，必须有角色，严格租户隔离。
 */
@Slf4j
@Component
public class WarehouseOpLogTool implements AgentTool {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final List<String> WAREHOUSE_ACTIONS =
            List.of("sample_loan", "sample_return", "finished_outbound");

    @Autowired
    private IntelligenceAuditLogMapper auditLogMapper;

    @Override
    public String getName() {
        return "tool_warehouse_op_log";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> actionType = new LinkedHashMap<>();
        actionType.put("type", "string");
        actionType.put("description", "筛选操作类型：sample_loan（样衣借调）、sample_return（样衣归还）、finished_outbound（大货出库）。不传则查询全部3类。");
        actionType.put("enum", WAREHOUSE_ACTIONS);
        properties.put("actionType", actionType);

        Map<String, Object> operatorName = new LinkedHashMap<>();
        operatorName.put("type", "string");
        operatorName.put("description", "按操作人姓名模糊搜索（可选）");
        properties.put("operatorName", operatorName);

        Map<String, Object> startDate = new LinkedHashMap<>();
        startDate.put("type", "string");
        startDate.put("description", "查询开始日期，格式 yyyy-MM-dd（可选）");
        properties.put("startDate", startDate);

        Map<String, Object> endDate = new LinkedHashMap<>();
        endDate.put("type", "string");
        endDate.put("description", "查询结束日期，格式 yyyy-MM-dd（可选，含当天）");
        properties.put("endDate", endDate);

        Map<String, Object> pageSize = new LinkedHashMap<>();
        pageSize.put("type", "integer");
        pageSize.put("description", "返回条数，默认20，最大50");
        properties.put("pageSize", pageSize);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("查询仓库操作历史记录（样衣借调/归还、大货出库）。支持按操作类型、操作人、时间范围筛选，返回最近操作明细。");
        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of());
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        // 安全门禁1：外发工厂账号不可查询
        if (UserContext.factoryId() != null) {
            return MAPPER.writeValueAsString(Map.of("error", "外发工厂账号无权查询仓库操作日志"));
        }

        // 安全门禁2：必须有角色信息
        String role = UserContext.role();
        if (role == null || role.isBlank()) {
            return MAPPER.writeValueAsString(Map.of("error", "账号角色信息缺失，无权查询仓库操作日志"));
        }

        Map<String, Object> args = MAPPER.readValue(argumentsJson, new TypeReference<>() {});
        Long tenantId = UserContext.tenantId();

        // 解析参数
        String actionType = getStr(args, "actionType");
        String operatorName = getStr(args, "operatorName");
        String startDateStr = getStr(args, "startDate");
        String endDateStr = getStr(args, "endDate");
        int limit = Math.min(50, getInt(args, "pageSize", 20));

        // 时间范围解析
        LocalDateTime startDt = null;
        LocalDateTime endDt = null;
        try {
            if (startDateStr != null) startDt = LocalDate.parse(startDateStr).atStartOfDay();
            if (endDateStr != null) endDt = LocalDate.parse(endDateStr).plusDays(1).atStartOfDay();
        } catch (DateTimeParseException e) {
            return MAPPER.writeValueAsString(Map.of("error", "日期格式错误，请使用 yyyy-MM-dd 格式"));
        }

        // 确定查询的 action 列表
        List<String> actions;
        if (actionType != null && WAREHOUSE_ACTIONS.contains(actionType)) {
            actions = List.of(actionType);
        } else {
            actions = WAREHOUSE_ACTIONS;
        }

        // 构建查询条件（严格租户隔离）
        LambdaQueryWrapper<IntelligenceAuditLog> wrapper = new LambdaQueryWrapper<IntelligenceAuditLog>()
                .eq(IntelligenceAuditLog::getTenantId, tenantId)
                .in(IntelligenceAuditLog::getAction, actions);

        if (operatorName != null && !operatorName.isBlank()) {
            wrapper.like(IntelligenceAuditLog::getReason, "操作人: " + operatorName);
        }
        if (startDt != null) {
            wrapper.ge(IntelligenceAuditLog::getCreatedAt, startDt);
        }
        if (endDt != null) {
            wrapper.lt(IntelligenceAuditLog::getCreatedAt, endDt);
        }
        wrapper.orderByDesc(IntelligenceAuditLog::getCreatedAt)
               .last("LIMIT " + limit);

        List<IntelligenceAuditLog> logs = auditLogMapper.selectList(wrapper);

        // 格式化输出
        List<Map<String, Object>> items = logs.stream().map(l -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("time", l.getCreatedAt() != null ? l.getCreatedAt().toString() : "");
            item.put("action", translateAction(l.getAction()));
            item.put("status", "SUCCESS".equals(l.getStatus()) ? "成功" : "失败");
            item.put("detail", l.getReason());
            if (l.getErrorMessage() != null && !l.getErrorMessage().isBlank()) {
                item.put("errorMessage", l.getErrorMessage());
            }
            return item;
        }).collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", items.size());
        result.put("records", items);
        if (items.isEmpty()) {
            result.put("message", "未找到符合条件的仓库操作记录");
        }
        return MAPPER.writeValueAsString(result);
    }

    private String translateAction(String action) {
        if (action == null) return "";
        return switch (action) {
            case "sample_loan" -> "样衣借调";
            case "sample_return" -> "样衣归还";
            case "finished_outbound" -> "大货出库";
            default -> action;
        };
    }

    private String getStr(Map<String, Object> args, String key) {
        Object val = args.get(key);
        if (val == null) return null;
        String s = val.toString().trim();
        return s.isBlank() ? null : s;
    }

    private int getInt(Map<String, Object> args, String key, int defaultVal) {
        Object val = args.get(key);
        if (val == null) return defaultVal;
        try {
            return Integer.parseInt(val.toString());
        } catch (NumberFormatException e) {
            return defaultVal;
        }
    }
}
