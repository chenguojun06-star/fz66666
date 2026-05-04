package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.mapper.MaterialStockMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.mapper.ProductSkuMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

@Slf4j
@Component
@AgentToolDef(name = "tool_inventory_summary", description = "库存价值汇总工具", domain = ToolDomain.WAREHOUSE, timeoutMs = 15000)
public class InventorySummaryTool extends AbstractAgentTool {

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

        properties.put("topN", intProp("返回前N条记录（默认10）"));

        return buildToolDef(
                "库存价值汇总工具。当用户问'库存值多少钱''成品仓占多少资金''面辅料库存金额''低库存预警'时调用。" +
                        "提供面辅料和成品的库存数量、单价、总价值汇总。",
                properties,
                List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (action == null) action = "summary";
        int topN = optionalInt(args, "topN") != null ? optionalInt(args, "topN") : 10;

        return switch (action) {
            case "summary" -> executeSummary();
            case "material_by_type" -> executeMaterialByType(topN);
            case "finished_by_style" -> executeFinishedByStyle(topN);
            case "alert" -> executeAlert(topN);
            default -> errorJson("未知操作: " + action);
        };
    }

    private String executeSummary() throws Exception {
        Long tenantId = UserContext.tenantId();

        List<Map<String, Object>> materialSummary = materialStockMapper.selectMaps(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<MaterialStock>()
                        .select("COUNT(*) as totalTypes",
                                "COALESCE(SUM(quantity),0) as totalQuantity",
                                "COALESCE(SUM(quantity * unit_price),0) as totalValue",
                                "COALESCE(SUM(locked_quantity),0) as totalLocked")
                        .eq("tenant_id", tenantId));

        List<Map<String, Object>> finishedSummary = productSkuMapper.selectMaps(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<ProductSku>()
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

        BigDecimal materialValue = toBigDecimal(materialSummary.isEmpty() ? null : materialSummary.get(0).get("totalValue"));
        BigDecimal finishedValue = toBigDecimal(finishedSummary.isEmpty() ? null : finishedSummary.get(0).get("totalValue"));
        result.put("grandTotalValue", formatAmount(materialValue.add(finishedValue)));

        return successJson("库存价值总览", result);
    }

    private String executeMaterialByType(int topN) throws Exception {
        Long tenantId = UserContext.tenantId();

        List<Map<String, Object>> byType = materialStockMapper.selectMaps(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<MaterialStock>()
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
        return successJson("按物料类型汇总", result);
    }

    private String executeFinishedByStyle(int topN) throws Exception {
        Long tenantId = UserContext.tenantId();

        List<Map<String, Object>> byStyle = productSkuMapper.selectMaps(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<ProductSku>()
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
        return successJson("按款式成品库存汇总", result);
    }

    private String executeAlert(int topN) throws Exception {
        Long tenantId = UserContext.tenantId();

        List<Map<String, Object>> alerts = materialStockMapper.selectMaps(
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<MaterialStock>()
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
        return successJson("低库存预警", result);
    }

    private String formatAmount(Object value) {
        if (value == null) return "¥0";
        BigDecimal bd = toBigDecimal(value);
        if (bd.compareTo(BigDecimal.valueOf(10000)) >= 0) {
            return "¥" + bd.divide(BigDecimal.valueOf(10000), 2, RoundingMode.HALF_UP) + "万";
        }
        return "¥" + bd.setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal toBigDecimal(Object value) {
        if (value == null) return BigDecimal.ZERO;
        if (value instanceof BigDecimal bd) return bd;
        try {
            return new BigDecimal(value.toString());
        } catch (Exception e) {
            return BigDecimal.ZERO;
        }
    }
}
