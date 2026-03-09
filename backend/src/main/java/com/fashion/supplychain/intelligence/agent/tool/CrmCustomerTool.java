package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.service.CustomerService;
import com.fashion.supplychain.intelligence.agent.AiTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * CRM客户查询工具
 */
@Slf4j
@Component
public class CrmCustomerTool implements AgentTool {

    @Autowired
    private CustomerService customerService;

    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_query_crm_customer";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new HashMap<>();

        Map<String, Object> companyNameProp = new HashMap<>();
        companyNameProp.put("type", "string");
        companyNameProp.put("description", "客户公司名称关键词，例如 '科技' 或 '服饰'");
        properties.put("companyName", companyNameProp);

        Map<String, Object> customerLevelProp = new HashMap<>();
        customerLevelProp.put("type", "string");
        customerLevelProp.put("description", "客户级别：A, B, C, D等");
        properties.put("customerLevel", customerLevelProp);

        Map<String, Object> contactPersonProp = new HashMap<>();
        contactPersonProp.put("type", "string");
        contactPersonProp.put("description", "联系人名字");
        properties.put("contactPerson", contactPersonProp);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("按条件查询CRM客户档案数据。返回客户列表，包括公司名、级别、折扣、联系人、信用分等。");

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
                args = objectMapper.readValue(argumentsJson, new TypeReference<Map<String, Object>>() {});
            }

            String companyName = (String) args.get("companyName");
            String customerLevel = (String) args.get("customerLevel");
            String contactPerson = (String) args.get("contactPerson");

            QueryWrapper<Customer> query = new QueryWrapper<>();
            if (companyName != null && !companyName.isBlank()) {
                query.like("company_name", companyName);
            }
            if (customerLevel != null && !customerLevel.isBlank()) {
                query.eq("customer_level", customerLevel);
            }
            if (contactPerson != null && !contactPerson.isBlank()) {
                query.like("contact_person", contactPerson);
            }

            // 限制返回条数，避免大对象
            query.last("LIMIT 10");

            List<Customer> customers = customerService.list(query);
            if (customers.isEmpty()) {
                return "{\"message\": \"未查询到任何客户数据\"}";
            }

            List<Map<String, Object>> resultList = new ArrayList<>();
            for (Customer c : customers) {
                Map<String, Object> dto = new HashMap<>();
                dto.put("customerNo", c.getCustomerNo());
                dto.put("companyName", c.getCompanyName());
                dto.put("customerLevel", c.getCustomerLevel());
                dto.put("contactPerson", c.getContactPerson());
                dto.put("contactPhone", c.getContactPhone());
                dto.put("industry", c.getIndustry());
                dto.put("remark", c.getRemark());
                resultList.add(dto);
            }
            return objectMapper.writeValueAsString(resultList);

        } catch (JsonProcessingException e) {
            log.error("Tool execution failed: parse json error", e);
            return "{\"error\": \"参数解析异常\"}";
        } catch (Exception e) {
            log.error("Tool execution failed", e);
            return "{\"error\": \"查询失败: " + e.getMessage() + "\"}";
        }
    }
}
