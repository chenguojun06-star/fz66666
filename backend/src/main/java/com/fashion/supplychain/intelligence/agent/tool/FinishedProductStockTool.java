package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 成品/大货库存查询工具 — 供 AI 顾问调用
 * 查询 t_product_sku 表中 stockQuantity > 0 的成品库存
 */
@Slf4j
@Component
public class FinishedProductStockTool extends AbstractAgentTool {

    @Autowired
    private ProductSkuService productSkuService;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_finished_product_stock";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new HashMap<>();

        Map<String, Object> styleNoProp = new HashMap<>();
        styleNoProp.put("type", "string");
        styleNoProp.put("description", "款号精确匹配，例如 'FZ2024001'");
        properties.put("styleNo", styleNoProp);

        Map<String, Object> colorProp = new HashMap<>();
        colorProp.put("type", "string");
        colorProp.put("description", "颜色精确匹配，例如 '红色', '黑色'。支持查询某个款某个颜色的库存");
        properties.put("color", colorProp);

        Map<String, Object> sizeProp = new HashMap<>();
        sizeProp.put("type", "string");
        sizeProp.put("description", "尺码精确匹配，例如 'M', 'XL'。支持查询某个款某个颜色某个尺码的精确库存");
        properties.put("size", sizeProp);

        Map<String, Object> skuCodeProp = new HashMap<>();
        skuCodeProp.put("type", "string");
        skuCodeProp.put("description", "SKU编码关键词，格式如 '款号-颜色-尺码'");
        properties.put("skuCode", skuCodeProp);

        Map<String, Object> limitProp = new HashMap<>();
        limitProp.put("type", "integer");
        limitProp.put("description", "返回最大条数，默认20，最大100");
        properties.put("limit", limitProp);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("查询成品/大货库存数据，精确到SKU级别（款号+颜色+尺码）。返回款号、颜色、尺码、SKU编码、库存数量、成本价等。适用于查询已入库的成品库存情况，支持按款号/颜色/尺码精确查询。用户问'库存还有多少'、'某个款某个色的库存'、'成品仓有什么货'时调用。");
        AiTool.AiParameters aiParams = new AiTool.AiParameters();
        aiParams.setProperties(properties);
        function.setParameters(aiParams);
        tool.setFunction(function);

        return tool;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        log.info("Tool: {} called with args: {}", getName(), argumentsJson);
        try {
            if (UserContext.factoryId() != null) {
                return OBJECT_MAPPER.writeValueAsString(Map.of("success", false, "error", "外发工厂账号无权查看成品库存数据"));
            }
            Map<String, Object> args = new HashMap<>();
            if (argumentsJson != null && !argumentsJson.isBlank()) {
                args = OBJECT_MAPPER.readValue(argumentsJson, new TypeReference<Map<String, Object>>() {});
            }

            String styleNo = (String) args.get("styleNo");
            String color = (String) args.get("color");
            String size = (String) args.get("size");
            String skuCode = (String) args.get("skuCode");
            int limit = Math.min(100, Math.max(1, args.get("limit") instanceof Number ? ((Number) args.get("limit")).intValue() : 20));

            QueryWrapper<ProductSku> query = new QueryWrapper<>();
            query.gt("stock_quantity", 0);

            if (styleNo != null && !styleNo.isBlank()) {
                query.eq("style_no", styleNo);
            }
            if (color != null && !color.isBlank()) {
                query.eq("color", color);
            }
            if (size != null && !size.isBlank()) {
                query.eq("size", size);
            }
            if (skuCode != null && !skuCode.isBlank()) {
                query.like("sku_code", skuCode);
            }

            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
            query.eq("tenant_id", tenantId);

            query.last("LIMIT " + limit);

            List<ProductSku> skus = productSkuService.list(query);

            List<Map<String, Object>> resultList = new ArrayList<>();
            for (ProductSku sku : skus) {
                Map<String, Object> item = new HashMap<>();
                item.put("skuCode", sku.getSkuCode());
                item.put("styleNo", sku.getStyleNo());
                item.put("color", sku.getColor());
                item.put("size", sku.getSize());
                item.put("stockQuantity", sku.getStockQuantity());
                item.put("costPrice", sku.getCostPrice());
                resultList.add(item);
            }

            Map<String, Object> result = new HashMap<>();
            result.put("total", resultList.size());
            result.put("items", resultList);
            if (resultList.isEmpty()) {
                result.put("message", "未找到符合条件的成品库存记录");
            }

            return OBJECT_MAPPER.writeValueAsString(result);
        } catch (Exception e) {
            log.error("FinishedProductStockTool execute error", e);
            return "{\"error\": \"查询成品库存失败: " + e.getMessage() + "\"}";
        }
    }
}
