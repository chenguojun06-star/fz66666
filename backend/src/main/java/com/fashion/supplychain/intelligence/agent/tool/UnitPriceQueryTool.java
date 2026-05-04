package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Component
@AgentToolDef(name = "tool_unit_price_query", description = "开发单价查询工具", domain = ToolDomain.FINANCE, timeoutMs = 15000)
public class UnitPriceQueryTool extends AbstractAgentTool {

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

        properties.put("styleNo", stringProp("款号（必填）"));
        properties.put("factoryName", stringProp("工厂名称（可选，用于筛选特定工厂）"));

        return buildToolDef(
                "开发单价查询工具。当用户问'这款加工单价多少''哪个工厂做更便宜''上次这个款多少钱''报价单价多少'时调用。" +
                        "提供工厂单价、报价单价、工序单价、历史对比等价格信息。",
                properties,
                List.of("action", "styleNo"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (action == null) action = "by_style";
        String styleNo = requireString(args, "styleNo");
        String factoryName = optionalString(args, "factoryName");

        return switch (action) {
            case "by_style" -> executeByStyle(styleNo, factoryName);
            case "compare" -> executeCompare(styleNo);
            case "history" -> executeHistory(styleNo);
            default -> errorJson("未知操作: " + action);
        };
    }

    private String executeByStyle(String styleNo, String factoryName) throws Exception {
        Long tenantId = UserContext.tenantId();

        StyleInfo style = styleInfoMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<StyleInfo>()
                        .eq("tenant_id", tenantId)
                        .eq("style_no", styleNo)
                        .last("LIMIT 1"));

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
                result.put("avgPrice", "¥" + totalPrice.divide(BigDecimal.valueOf(priceCount), 2, RoundingMode.HALF_UP));
                result.put("latestPrice", "¥" + orders.get(0).getFactoryUnitPrice());
            }
        } else {
            result.put("orderCount", 0);
            result.put("note", "该款式暂无含单价的订单记录");
        }

        return successJson("单价查询结果", result);
    }

    private String executeCompare(String styleNo) throws Exception {
        Long tenantId = UserContext.tenantId();

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

        return successJson("工厂单价对比", result);
    }

    private String executeHistory(String styleNo) throws Exception {
        Long tenantId = UserContext.tenantId();

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
        return successJson("历史单价趋势", result);
    }
}
