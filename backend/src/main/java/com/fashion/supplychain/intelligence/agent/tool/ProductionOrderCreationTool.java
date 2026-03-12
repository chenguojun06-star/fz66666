package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 生产订单快速建单工具 — AI对话中创建生产订单
 * Skill分类：操作类 Skill — 生产订单建单
 *
 * ⚠️ 架构约定：工具直接调用Service(非Orchestrator)，因为AI对话中的建单行为
 *    是轻量创建（status=pending），不涉及工序复制等复杂流程，用户需在管理后台
 *    进一步完善订单细节。如需完整建单流程请使用 PC端 下单管理页。
 */
@Slf4j
@Component
public class ProductionOrderCreationTool implements AgentTool {

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ProductionOrderService productionOrderService;

    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_create_production_order";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new HashMap<>();

        Map<String, Object> styleNoProp = new HashMap<>();
        styleNoProp.put("type", "string");
        styleNoProp.put("description", "款号（Style No），必填，例如：D2024001");
        properties.put("styleNo", styleNoProp);

        Map<String, Object> orderQtyProp = new HashMap<>();
        orderQtyProp.put("type", "integer");
        orderQtyProp.put("description", "订单数量（件），必填，例如：500");
        properties.put("orderQuantity", orderQtyProp);

        Map<String, Object> factoryNameProp = new HashMap<>();
        factoryNameProp.put("type", "string");
        factoryNameProp.put("description", "工厂名称（可选），填写合作工厂全称，例如：鑫达制衣厂");
        properties.put("factoryName", factoryNameProp);

        Map<String, Object> deliveryDateProp = new HashMap<>();
        deliveryDateProp.put("type", "string");
        deliveryDateProp.put("description", "交期/计划完成日期（可选），格式 yyyy-MM-dd，例如：2026-06-30");
        properties.put("deliveryDate", deliveryDateProp);

        Map<String, Object> remarkProp = new HashMap<>();
        remarkProp.put("type", "string");
        remarkProp.put("description", "订单备注（可选），例如：春季款，优先排期");
        properties.put("remark", remarkProp);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("快速创建生产订单草稿。提供款号和数量即可建单，工厂和交期可选填。创建后订单状态为'待生产'，请到生产管理页面完善工序和尺码信息。当用户说'帮我建单/创建订单/下单'时调用此工具，必须先确认款号和数量。");
        AiTool.AiParameters aiParams = new AiTool.AiParameters();
        aiParams.setProperties(properties);
        aiParams.setRequired(List.of("styleNo", "orderQuantity"));
        function.setParameters(aiParams);
        tool.setFunction(function);
        return tool;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String execute(String argumentsJson) {
        try {
            JsonNode args = objectMapper.readTree(argumentsJson);
            String styleNo = args.path("styleNo").asText("").trim();
            int orderQuantity = args.path("orderQuantity").asInt(0);
            String factoryName = args.path("factoryName").asText("").trim();
            String deliveryDateStr = args.path("deliveryDate").asText("").trim();
            String remark = args.path("remark").asText("").trim();

            if (styleNo.isEmpty()) {
                return "{\"error\": \"请提供款号\"}";
            }
            if (orderQuantity <= 0) {
                return "{\"error\": \"订单数量必须大于0\"}";
            }

            Long tenantId = UserContext.tenantId();
            String userId = UserContext.userId();
            String username = UserContext.username();

            // 查找款式信息
            QueryWrapper<StyleInfo> styleQw = new QueryWrapper<StyleInfo>()
                    .eq("style_no", styleNo)
                    .eq(tenantId != null, "tenant_id", tenantId)
                    .eq("delete_flag", 0)
                    .last("LIMIT 1");
            StyleInfo style = styleInfoService.getOne(styleQw, false);

            if (style == null) {
                return "{\"error\": \"未找到款号 " + styleNo + " 的款式信息，请确认款号是否正确。可以先查询可用款号列表。\"}";
            }

            // 构建交期
            LocalDateTime plannedEndDate = null;
            if (!deliveryDateStr.isEmpty()) {
                try {
                    plannedEndDate = LocalDate.parse(deliveryDateStr).atTime(23, 59, 59);
                } catch (DateTimeParseException e) {
                    return "{\"error\": \"交期格式错误，请使用 yyyy-MM-dd 格式，例如：2026-06-30\"}";
                }
            }

            // 创建订单
            ProductionOrder order = new ProductionOrder();
            order.setStyleId(String.valueOf(style.getId()));
            order.setStyleNo(style.getStyleNo());
            order.setStyleName(style.getStyleName());
            order.setOrderQuantity(orderQuantity);
            order.setCuttingQuantity(orderQuantity); // 裁剪数量默认与订单数量相同

            if (StringUtils.hasText(factoryName)) {
                order.setFactoryName(factoryName);
            } else {
                order.setFactoryName("");
            }

            if (plannedEndDate != null) {
                order.setPlannedEndDate(plannedEndDate);
            }

            if (StringUtils.hasText(remark)) {
                order.setRemarks(remark);
            }

            order.setStatus("pending");
            order.setProductionProgress(0);
            order.setMaterialArrivalRate(0);
            order.setDeleteFlag(0);
            order.setTenantId(tenantId);

            if (StringUtils.hasText(userId)) {
                order.setCreatedById(userId);
            }
            if (StringUtils.hasText(username)) {
                order.setCreatedByName(username);
            }

            boolean saved = productionOrderService.save(order);
            if (!saved || order.getId() == null) {
                return "{\"error\": \"创建订单失败，请稍后重试\"}";
            }

            log.info("[ProductionOrderCreationTool] AI建单成功 styleNo={} qty={} orderId={} orderNo={}",
                    styleNo, orderQuantity, order.getId(), order.getOrderNo());

            // 返回创建结果
            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("orderId", order.getId());
            result.put("orderNo", order.getOrderNo() != null ? order.getOrderNo() : "系统生成中");
            result.put("styleNo", styleNo);
            result.put("styleName", style.getStyleName() != null ? style.getStyleName() : "");
            result.put("orderQuantity", orderQuantity);
            result.put("factoryName", StringUtils.hasText(factoryName) ? factoryName : "待指定");
            result.put("deliveryDate", !deliveryDateStr.isEmpty() ? deliveryDateStr : "待设置");
            result.put("status", "pending");
            result.put("statusLabel", "待生产");
            result.put("message", "订单已创建成功！请前往「生产管理 → 我的订单」页面完善工序价格和尺码颜色信息后即可正式投产。");

            return objectMapper.writeValueAsString(result);

        } catch (Exception e) {
            log.error("[ProductionOrderCreationTool] 建单异常", e);
            return "{\"error\": \"建单失败: " + e.getMessage() + "\"}";
        }
    }
}
