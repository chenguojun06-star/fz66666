package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.helper.StepWizardBuilder;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.*;

/**
 * 订单业务字段编辑工具 — 让管理者通过小云AI对话修改订单核心字段
 * 支持字段：remarks(备注)、expectedShipDate(预计出货日)、urgencyLevel(紧急程度)、
 *          plannedEndDate(计划完成日期)、factoryName(工厂名称)、company(客户名称)
 * 前置条件：orderId 必填，至少修改一个字段
 */
@Slf4j
@Component
public class OrderEditTool implements AgentTool {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private AiAgentToolAccessService aiAgentToolAccessService;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_order_edit";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> orderId = new LinkedHashMap<>();
        orderId.put("type", "string");
        orderId.put("description", "订单ID（必填）");
        properties.put("orderId", orderId);

        Map<String, Object> remarks = new LinkedHashMap<>();
        remarks.put("type", "string");
        remarks.put("description", "订单备注");
        properties.put("remarks", remarks);

        Map<String, Object> expectedShipDate = new LinkedHashMap<>();
        expectedShipDate.put("type", "string");
        expectedShipDate.put("description", "预计出货日期，格式 yyyy-MM-dd");
        properties.put("expectedShipDate", expectedShipDate);

        Map<String, Object> plannedEndDate = new LinkedHashMap<>();
        plannedEndDate.put("type", "string");
        plannedEndDate.put("description", "计划完成日期（交货日期），格式 yyyy-MM-dd");
        properties.put("plannedEndDate", plannedEndDate);

        Map<String, Object> urgencyLevel = new LinkedHashMap<>();
        urgencyLevel.put("type", "string");
        urgencyLevel.put("enum", List.of("normal", "urgent", "critical"));
        urgencyLevel.put("description", "紧急程度：normal(普通)、urgent(加急)、critical(特急)");
        properties.put("urgencyLevel", urgencyLevel);

        Map<String, Object> factoryName = new LinkedHashMap<>();
        factoryName.put("type", "string");
        factoryName.put("description", "工厂名称");
        properties.put("factoryName", factoryName);

        Map<String, Object> company = new LinkedHashMap<>();
        company.put("type", "string");
        company.put("description", "客户/公司名称");
        properties.put("company", company);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("订单编辑工具。当用户说'修改订单备注'、'更新出货日期'、'把订单改为加急'、'修改交货日期'、'修改客户'时调用。" +
                "必须提供订单ID和要修改的字段。");

        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of("orderId"));
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        if (!aiAgentToolAccessService.hasManagerAccess()) {
            return MAPPER.writeValueAsString(Map.of("error", "当前角色无权执行该操作"));
        }
        Map<String, Object> args = MAPPER.readValue(argumentsJson, new TypeReference<>() {});

        String orderId = (String) args.get("orderId");
        if (orderId == null || orderId.isBlank()) {
            return MAPPER.writeValueAsString(Map.of("error", "请提供订单ID（orderId）"));
        }

        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getId, orderId.trim())
                .eq(ProductionOrder::getTenantId, tenantId)
                .one();
        if (order == null) {
            return MAPPER.writeValueAsString(Map.of("error", "订单不存在或无权访问"));
        }

        // 工厂账号只能编辑自己工厂的订单
        String userFactoryId = UserContext.factoryId();
        if (userFactoryId != null && !userFactoryId.equals(order.getFactoryId())) {
            return MAPPER.writeValueAsString(Map.of("error", "该订单不属于您的工厂，无权编辑"));
        }

        List<String> updatedFields = new ArrayList<>();

        if (args.containsKey("remarks")) {
            order.setRemarks((String) args.get("remarks"));
            updatedFields.add("备注");
        }

        if (args.containsKey("expectedShipDate")) {
            String dateStr = (String) args.get("expectedShipDate");
            if (StringUtils.hasText(dateStr)) {
                order.setExpectedShipDate(LocalDate.parse(dateStr));
            } else {
                order.setExpectedShipDate(null);
            }
            updatedFields.add("预计出货日期");
        }

        if (args.containsKey("plannedEndDate")) {
            String dateStr = (String) args.get("plannedEndDate");
            if (StringUtils.hasText(dateStr)) {
                order.setPlannedEndDate(LocalDate.parse(dateStr).atTime(LocalTime.MAX));
            } else {
                order.setPlannedEndDate(null);
            }
            updatedFields.add("计划完成日期");
        }

        if (args.containsKey("urgencyLevel")) {
            String level = (String) args.get("urgencyLevel");
            order.setUrgencyLevel(StringUtils.hasText(level) ? level : "normal");
            updatedFields.add("紧急程度");
        }

        if (args.containsKey("factoryName")) {
            order.setFactoryName((String) args.get("factoryName"));
            updatedFields.add("工厂名称");
        }

        if (args.containsKey("company")) {
            order.setCompany((String) args.get("company"));
            updatedFields.add("客户名称");
        }

        if (updatedFields.isEmpty()) {
            Map<String, Object> wizard = StepWizardBuilder.build("order_edit", "编辑订单", "选择要修改的字段并填写新值", "✏️", "确认修改", "编辑订单",
                StepWizardBuilder.steps(
                    StepWizardBuilder.step("fields", "选择修改项", "选择要修改的字段",
                        StepWizardBuilder.textField("remarks", "备注", false, "输入新备注"),
                        StepWizardBuilder.dateField("expectedShipDate", "预计出货日期", false),
                        StepWizardBuilder.dateField("plannedEndDate", "计划完成日期", false),
                        StepWizardBuilder.selectField("urgencyLevel", "紧急程度", false,
                            StepWizardBuilder.opt("普通","normal"), StepWizardBuilder.opt("紧急","urgent"), StepWizardBuilder.opt("特急","critical")),
                        StepWizardBuilder.textField("factoryName", "工厂名称", false, "输入新工厂名称"),
                        StepWizardBuilder.textField("company", "客户名称", false, "输入新客户名称"))
                ));
            return MAPPER.writeValueAsString(StepWizardBuilder.wrapResult("请至少提供一个要修改的字段", true, List.of("修改字段"), "请选择要修改的字段并填写新值", wizard));
        }

        try {
            boolean success = productionOrderService.updateById(order);
            if (!success) {
                return MAPPER.writeValueAsString(Map.of("success", false, "message", "订单更新失败"));
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("success", true);
            result.put("message", "订单更新成功：" + String.join("、", updatedFields));
            result.put("orderId", orderId.trim());
            result.put("orderNo", order.getOrderNo());
            result.put("updatedFields", updatedFields);
            log.info("[OrderEditTool] 订单编辑成功: orderId={}, fields={}", orderId, updatedFields);
            return MAPPER.writeValueAsString(result);

        } catch (Exception e) {
            return MAPPER.writeValueAsString(Map.of(
                    "success", false,
                    "message", "订单更新异常：" + e.getMessage()));
        }
    }
}
