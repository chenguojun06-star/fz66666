package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 开发单价查询工具 — 让小云AI能直接回答"这款加工单价多少""哪个工厂做更便宜""上次这个款多少钱"等问题。
 *
 * <p>支持操作：
 * <ul>
 *   <li>by_style — 按款号查询单价（含历史订单单价对比）</li>
 *   <li>compare — 同款式不同工厂单价对比</li>
 *   <li>history — 某款的历史单价变化趋势</li>
 * </ul>
 */
@Slf4j
@Component
public class UnitPriceQueryTool implements AgentTool {

    @Autowired
    private ProductionOrderMapper productionOrderMapper;

    @Autowired
    private StyleInfoMapper styleInfoMapper;

    @Override
    public String getName() {
        return "tool_unit_price_query";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> action = new LinkedHashMap<>();
        action.put("type", "string");
        action.put("enum", List.of("by_style", "compare", "history"));
        action.put("description", "操作类型：by_style=按款号查单价，compare=多工厂单价对比，history=历史单价趋势");
        properties.put("action", action);

        Map<String, Object> styleNo = new LinkedHashMap<>();
        styleNo.put("type", "string");
        styleNo.put("description", "款号（必填）");
        properties.put("styleNo", styleNo);

        Map<String, Object> factoryName = new LinkedHashMap<>();
        factoryName.put("type", "string");
        factoryName.put("description", "工厂名称（可选，用于筛选特定工厂）");
        properties.put("factoryName", factoryName);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("开发单价查询工具。当用户问'这款加工单价多少''哪个工厂做更便宜''上次这个款多少钱''报价单价多少'时调用。" +
                "提供工厂单价、报价单价、工序单价、历史对比等价格信息。");
        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of("action", "styleNo"));
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        Map<String, Object> args = new com.fasterxml.jackson.databind.ObjectMapper().readValue(argumentsJson, new com.fasterxml.jackson.core.type.TypeReference<>() {});
        String action = (String) args.getOrDefault("action", "by_style");
        String styleNo = (String) args.get("styleNo");
        String factoryName = (String) args.get("factoryName");

        if (styleNo == null || styleNo.isBlank()) {
            return errorJson("styleNo参数必填");
        }

        return switch (action) {
            case "by_style" -> executeByStyle(tenantId, styleNo, factoryName);
            case "compare" -> executeCompare(tenantId, styleNo);
            case "history" -> executeHistory(tenantId, styleNo);
            default -> errorJson("未知操作: " + action);
        };
    }

    private String executeByStyle(Long tenantId, String styleNo, String factoryName) {
        try {
            // 查询款式信息
            StyleInfo style = styleInfoMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<StyleInfo>()
                            .eq("tenant_id", tenantId)
                            .eq("style_no", styleNo)
                            .last("LIMIT 1"));

            // 查询该款的历史订单（含单价）
            var orderQuery = new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<ProductionOrder>()
                    .eq("tenant_id", tenantId)
                    .eq("style_no", styleNo)
                    .isNotNull("factory_unit_price")
                    .orderByDesc("create_time");

            if (factoryName != null && !factoryName.isBlank()) {
                orderQuery.eq("factory_name", factoryName);
            }

            List<ProductionOrder> orders = productionOrderMapper.selectList(orderQuery);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("action", "by_style");
            result.put("styleNo", styleNo);

            if (style != null) {
                result.put("styleName", style.getStyleName());
                result.put("category", style.getCategory());
            }

            // 汇总单价信息
            if (!orders.isEmpty()) {
                List<Map<String, Object>> orderPrices = new ArrayList<>();
                BigDecimal minPrice = null, maxPrice = null, totalPrice = BigDecimal.ZERO;
                int priceCount = 0;

                for (ProductionOrder order : orders.stream().limit(10).toList()) {
                    Map<String, Object> p = new LinkedHashMap<>();
                    p.put("orderNo", order.getOrderNo());
                    p.put("factoryName", order.getFactoryName());
                    p.put("factoryUnitPrice", order.getFactoryUnitPrice());
                    p.put("quotationUnitPrice", order.getQuotationUnitPrice());
                    p.put("orderQuantity", order.getOrderQuantity());
                    p.put("status", order.getStatus());
                    p.put("createdAt", order.getCreateTime() != null ? order.getCreateTime().toString() : null);
                    orderPrices.add(p);

                    if (order.getFactoryUnitPrice() != null) {
                        if (minPrice == null || order.getFactoryUnitPrice().compareTo(minPrice) < 0) minPrice = order.getFactoryUnitPrice();
                        if (maxPrice == null || order.getFactoryUnitPrice().compareTo(maxPrice) > 0) maxPrice = order.getFactoryUnitPrice();
                        totalPrice = totalPrice.add(order.getFactoryUnitPrice());
                        priceCount++;
                    }
                }

                result.put("orderCount", orders.size());
                result.put("recentOrders", orderPrices);

                if (priceCount > 0) {
                    result.put("priceRange", "¥" + minPrice + " ~ ¥" + maxPrice);
                    result.put("avgPrice", "¥" + totalPrice.divide(BigDecimal.valueOf(priceCount), 2, java.math.RoundingMode.HALF_UP));
                    result.put("latestPrice", "¥" + orders.get(0).getFactoryUnitPrice());
                }
            } else {
                result.put("orderCount", 0);
                result.put("note", "该款式暂无含单价的订单记录");
            }

            return successJson(result);
        } catch (Exception e) {
            log.warn("[UnitPriceQuery] by_style查询失败: {}", e.getMessage());
            return errorJson("单价查询失败: " + e.getMessage());
        }
    }

    private String executeCompare(Long tenantId, String styleNo) {
        try {
            // 按工厂分组查询平均单价
            List<Map<String, Object>> byFactory = productionOrderMapper.selectMaps(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<ProductionOrder>()
                            .select("factory_name as factory",
                                    "COUNT(*) as orderCount",
                                    "AVG(factory_unit_price) as avgPrice",
                                    "MIN(factory_unit_price) as minPrice",
                                    "MAX(factory_unit_price) as maxPrice",
                                    "SUM(order_quantity) as totalQuantity")
                            .eq("tenant_id", tenantId)
                            .eq("style_no", styleNo)
                            .isNotNull("factory_unit_price")
                            .groupBy("factory_name")
                            .orderByAsc("avgPrice"));

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("action", "compare");
            result.put("styleNo", styleNo);
            result.put("factoryComparison", byFactory);

            if (!byFactory.isEmpty()) {
                Map<String, Object> cheapest = byFactory.get(0);
                result.put("cheapestFactory", cheapest.get("factory"));
                result.put("cheapestAvgPrice", cheapest.get("avgPrice"));
            }

            return successJson(result);
        } catch (Exception e) {
            log.warn("[UnitPriceQuery] compare查询失败: {}", e.getMessage());
            return errorJson("工厂对比查询失败: " + e.getMessage());
        }
    }

    private String executeHistory(Long tenantId, String styleNo) {
        try {
            List<ProductionOrder> orders = productionOrderMapper.selectList(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<ProductionOrder>()
                            .eq("tenant_id", tenantId)
                            .eq("style_no", styleNo)
                            .isNotNull("factory_unit_price")
                            .orderByAsc("create_time")
                            .last("LIMIT 20"));

            List<Map<String, Object>> history = orders.stream().map(o -> {
                Map<String, Object> h = new LinkedHashMap<>();
                h.put("orderNo", o.getOrderNo());
                h.put("factoryName", o.getFactoryName());
                h.put("factoryUnitPrice", o.getFactoryUnitPrice());
                h.put("orderQuantity", o.getOrderQuantity());
                h.put("date", o.getCreateTime() != null ? o.getCreateTime().toLocalDate().toString() : null);
                return h;
            }).collect(Collectors.toList());

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("action", "history");
            result.put("styleNo", styleNo);
            result.put("history", history);
            return successJson(result);
        } catch (Exception e) {
            log.warn("[UnitPriceQuery] history查询失败: {}", e.getMessage());
            return errorJson("历史单价查询失败: " + e.getMessage());
        }
    }

    private String successJson(Map<String, Object> data) {
        data.put("success", true);
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(data);
        } catch (Exception e) {
            return "{\"success\":true}";
        }
    }

    private String errorJson(String msg) {
        return "{\"success\":false,\"error\":\"" + msg.replace("\"", "'") + "\"}";
    }
}
