package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 系统人员/用户查询工具
 */
@Slf4j
@Component
public class SystemUserTool implements AgentTool {

    @Autowired
    private UserService userService;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_query_system_user";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new HashMap<>();

        Map<String, Object> usernameProp = new HashMap<>();
        usernameProp.put("type", "string");
        usernameProp.put("description", "账号或用户名关键词，例如 '张三'");
        properties.put("username", usernameProp);

        Map<String, Object> roleNameProp = new HashMap<>();
        roleNameProp.put("type", "string");
        roleNameProp.put("description", "人员角色名称，例如 '车缝工', '财务', '管理员'");
        properties.put("roleName", roleNameProp);

        Map<String, Object> processCodeProp = new HashMap<>();
        processCodeProp.put("type", "string");
        processCodeProp.put("description", "人员擅长的工序类型，例如 'sewing', 'cutting'");
        properties.put("processCode", processCodeProp);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("按条件查询系统内的员工/用户数据。返回账号名、角色、数据权限范围等信息。");
        AiTool.AiParameters aiParams = new AiTool.AiParameters();
        aiParams.setProperties(properties);
        function.setParameters(aiParams);
        tool.setFunction(function);

        return tool;
    }

    @Override
    public String execute(String argumentsJson) {
        log.info("Tool: {} called with args: {}", getName(), argumentsJson);
        try {
            Map<String, Object> args = new HashMap<>();
            if (argumentsJson != null && !argumentsJson.isBlank()) {
                args = OBJECT_MAPPER.readValue(argumentsJson, new TypeReference<Map<String, Object>>() {});
            }

            String username = (String) args.get("username");
            String roleName = (String) args.get("roleName");
            String processCode = (String) args.get("processCode");

            QueryWrapper<User> query = new QueryWrapper<>();
            if (username != null && !username.isBlank()) {
                query.like("username", username)
                     .or().like("name", username); // 如果有name字段的话，不过User表目前主要是username作为显示
            }
            if (roleName != null && !roleName.isBlank()) {
                query.like("role_name", roleName);
            }
            Long tenantId = UserContext.tenantId();
            if (tenantId != null) {
                query.eq("tenant_id", tenantId);
            }

            query.last("LIMIT 10");

            List<User> users = userService.list(query);
            if (users.isEmpty()) {
                return "{\"message\": \"未查询到相应的员工或用户数据\"}";
            }

            List<Map<String, Object>> resultList = new ArrayList<>();
            for (User u : users) {
                Map<String, Object> dto = new HashMap<>();
                dto.put("username", u.getUsername());
                dto.put("roleName", u.getRoleName());
                dto.put("permissionRange", u.getPermissionRange()); // 数据范围，如'ALL','FACTORY:F001'
                dto.put("approvalStatus", u.getApprovalStatus()); // 状态: APPROVED, PENDING等
                resultList.add(dto);
            }
            return OBJECT_MAPPER.writeValueAsString(resultList);

        } catch (JsonProcessingException e) {
            log.error("Tool execution failed: parse json error", e);
            return "{\"error\": \"参数解析异常\"}";
        } catch (Exception e) {
            log.error("Tool execution failed", e);
            return "{\"error\": \"查询失败: " + e.getMessage() + "\"}";
        }
    }
}
