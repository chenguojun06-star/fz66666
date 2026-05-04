package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.warehouse.mapper.MaterialStockMapper;
import com.fashion.supplychain.warehouse.mapper.ProductSkuMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.*;

/**
 * 库存价值汇总工具 — 让小云AI能直接回答"库存值多少钱""成品仓占多少资金"等问题。
 *
 * <p>支持操作：
 * <ul>
 *   <li>summary — 库存价值总览（面辅料总价值、成品总价值、总库存金额）</li>
 *   <li>material_by_type — 按物料类型分组的价值汇总</li>
 *   <li>finished_by_style — 按款式分组的成品库存汇总</li>
 *   <li>alert — 低库存预警（可用量低于安全库存的物料）</li>
 * </ul>
 */
@Slf4j
@Component
public class InventorySummaryTool implements AgentTool {

    @Autowired
    private MaterialStockMapper materialStockMapper;

    @Autowired
    private ProductSkuMapper productSkuMapper;

    @Override
    public String getName() {
        return "tool_inventory_summary";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> action = new LinkedHashMap<>();
        action.put("type", "string");
        action.put("enum", List.of("summary", "material_by_type", "finished_by_style", "alert"));
        action.put("description", "操作类型：summary=库存价值总览，material_by_type=按物料类型分组价值，finished_by_style=按款式分组成品库存，alert=低库存预警");
        properties.put("action", action);

        Map<String, Object> topN = new LinkedHashMap<>();
        topN.put("type", "integer");
        topN.put("description", "返回前N条记录（默认10）");
        properties.put("topN", topN);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("库存价值汇总工具。当用户问'库存值多少钱''成品仓占多少资金''面辅料库存金额''低库存预警'时调用。" +
                "提供面辅料和成品的库存数量、单价、总价值汇总。");
        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of("action"));
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        Map<String, Object> args = new com.fasterxml.jackson.databind.ObjectMapper().readValue(argumentsJson, new com.fasterxml.jackson.core.type.TypeReference<>() {});
        String action = (String) args.getOrDefault("action", "summary");
        int topN = args.containsKey("topN") ? ((Number) args.get("topN")).intValue() : 10;

        return switch (action) {
            case "summary" -> executeSummary(tenantId);
            case "material_by_type" -> executeMaterialByType(tenantId, topN);
            case "finished_by_style" -> executeFinishedByStyle(tenantId, topN);
            case "alert" -> executeAlert(tenantId, topN);
            default -> errorJson("未知操作: " + action);
        };
    }

    private String executeSummary(Long tenantId) {
        try {
            // 面辅料库存汇总
            List<Map<String, Object>> materialSummary = materialStockMapper.selectMaps(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<>()
                            .select("COUNT(*) as totalTypes",
                                    "COALESCE(SUM(quantity),0) as totalQuantity",
                                    "COALESCE(SUM(quantity * unit_price),0) as totalValue",
                                    "COALESCE(SUM(locked_quantity),0) as totalLocked")
                            .eq("tenant_id", tenantId));

            // 成品库存汇总
            List<Map<String, Object>> finishedSummary = productSkuMapper.selectMaps(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<>()
                            .select("COUNT(*) as totalSkus",
                                    "COALESCE(SUM(stock_quantity),0) as totalQuantity",
                                    "COALESCE(SUM(stock_quantity * cost_price),0) as totalValue")
                            .eq("tenant_id", tenantId));

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("action", "summary");

            if (!materialSummary.isEmpty() && materialSummary.get(0) != null) {
                Map<String, Object> m = materialSummary.get(0);
                Map<String, Object> material = new LinkedHashMap<>();
                material.put("totalTypes", m.get("totalTypes"));
                material.put("totalQuantity", m.get("totalQuantity"));
                material.put("totalLocked", m.get("totalLocked"));
                material.put("totalValue", formatAmount(m.get("totalValue")));
                result.put("materialStock", material);
            }

            if (!finishedSummary.isEmpty() && finishedSummary.get(0) != null) {
                Map<String, Object> f = finishedSummary.get(0);
                Map<String, Object> finished = new LinkedHashMap<>();
                finished.put("totalSkus", f.get("totalSkus"));
                finished.put("totalQuantity", f.get("totalQuantity"));
                finished.put("totalValue", formatAmount(f.get("totalValue")));
                result.put("finishedStock", finished);
            }

            // 总计
            BigDecimal materialValue = toBigDecimal(materialSummary.isEmpty() ? null : materialSummary.get(0).get("totalValue"));
            BigDecimal finishedValue = toBigDecimal(finishedSummary.isEmpty() ? null : finishedSummary.get(0).get("totalValue"));
            result.put("grandTotalValue", formatAmount(materialValue.add(finishedValue)));

            return successJson(result);
        } catch (Exception e) {
            log.warn("[InventorySummary] summary查询失败: {}", e.getMessage());
            return errorJson("库存汇总查询失败: " + e.getMessage());
        }
    }

    private String executeMaterialByType(Long tenantId, int topN) {
        try {
            List<Map<String, Object>> byType = materialStockMapper.selectMaps(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<>()
                            .select("material_type as type",
                                    "COUNT(*) as typeCount",
                                    "COALESCE(SUM(quantity),0) as totalQuantity",
                                    "COALESCE(SUM(quantity * unit_price),0) as totalValue")
                            .eq("tenant_id", tenantId)
                            .groupBy("material_type")
                            .orderByDesc("totalValue")
                            .last("LIMIT " + topN));

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("action", "material_by_type");
            result.put("items", byType.stream().map(m -> {
                Map<String, Object> item = new LinkedHashMap<>(m);
                item.put("totalValue", formatAmount(m.get("totalValue")));
                return item;
            }).toList());
            return successJson(result);
        } catch (Exception e) {
            log.warn("[InventorySummary] material_by_type查询失败: {}", e.getMessage());
            return errorJson("按类型汇总查询失败: " + e.getMessage());
        }
    }

    private String executeFinishedByStyle(Long tenantId, int topN) {
        try {
            List<Map<String, Object>> byStyle = productSkuMapper.selectMaps(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<>()
                            .select("style_no as styleNo",
                                    "COUNT(*) as skuCount",
                                    "COALESCE(SUM(stock_quantity),0) as totalQuantity",
                                    "COALESCE(SUM(stock_quantity * cost_price),0) as totalValue")
                            .eq("tenant_id", tenantId)
                            .groupBy("style_no")
                            .orderByDesc("totalValue")
                            .last("LIMIT " + topN));

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("action", "finished_by_style");
            result.put("items", byStyle.stream().map(m -> {
                Map<String, Object> item = new LinkedHashMap<>(m);
                item.put("totalValue", formatAmount(m.get("totalValue")));
                return item;
            }).toList());
            return successJson(result);
        } catch (Exception e) {
            log.warn("[InventorySummary] finished_by_style查询失败: {}", e.getMessage());
            return errorJson("按款式汇总查询失败: " + e.getMessage());
        }
    }

    private String executeAlert(Long tenantId, int topN) {
        try {
            // 查询可用量低于安全库存的物料（简化：可用量<10视为低库存）
            List<Map<String, Object>> alerts = materialStockMapper.selectMaps(
                    new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<>()
                            .select("material_name as name",
                                    "material_type as type",
                                    "quantity",
                                    "locked_quantity as lockedQuantity",
                                    "(quantity - locked_quantity) as availableQuantity",
                                    "unit_price as unitPrice",
                                    "supplier_name as supplier")
                            .eq("tenant_id", tenantId)
                            .lt("quantity - locked_quantity", 10)
                            .gt("quantity", 0)
                            .orderByAsc("quantity - locked_quantity")
                            .last("LIMIT " + topN));

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("action", "alert");
            result.put("alertCount", alerts.size());
            result.put("items", alerts);
            return successJson(result);
        } catch (Exception e) {
            log.warn("[InventorySummary] alert查询失败: {}", e.getMessage());
            return errorJson("低库存预警查询失败: " + e.getMessage());
        }
    }

    private String formatAmount(Object value) {
        if (value == null) return "¥0";
        BigDecimal bd = toBigDecimal(value);
        if (bd.compareTo(java.math.BigDecimal.valueOf(10000)) >= 0) {
            return "¥" + bd.divide(java.math.BigDecimal.valueOf(10000), 2, java.math.RoundingMode.HALF_UP) + "万";
        }
        return "¥" + bd.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private BigDecimal toBigDecimal(Object value) {
        if (value == null) return BigDecimal.ZERO;
        if (value instanceof BigDecimal) return (BigDecimal) value;
        try {
            return new BigDecimal(value.toString());
        } catch (Exception e) {
            return BigDecimal.ZERO;
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
