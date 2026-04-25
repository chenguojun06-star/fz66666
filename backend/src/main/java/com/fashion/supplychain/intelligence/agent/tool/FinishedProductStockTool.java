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
public class FinishedProductStockTool implements AgentTool {

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
        styleNoProp.put("description", "款号关键词，例如 'FZ2024'");
        properties.put("styleNo", styleNoProp);

        Map<String, Object> colorProp = new HashMap<>();
        colorProp.put("type", "string");
        colorProp.put("description", "颜色，例如 '红色', '黑色'");
        properties.put("color", colorProp);

        Map<String, Object> sizeProp = new HashMap<>();
        sizeProp.put("type", "string");
        sizeProp.put("description", "尺码，例如 'M', 'XL'");
        properties.put("size", sizeProp);

        Map<String, Object> skuCodeProp = new HashMap<>();
        skuCodeProp.put("type", "string");
        skuCodeProp.put("description", "SKU编码关键词");
        properties.put("skuCode", skuCodeProp);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("查询成品/大货库存数据。返回款号、颜色、尺码、SKU编码、库存数量、成本价等。适用于查询已入库的成品库存情况。");
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

            String styleNo = (String) args.get("styleNo");
            String color = (String) args.get("color");
            String size = (String) args.get("size");
            String skuCode = (String) args.get("skuCode");

            QueryWrapper<ProductSku> query = new QueryWrapper<>();
            query.gt("stock_quantity", 0);

            if (styleNo != null && !styleNo.isBlank()) {
                query.like("style_no", styleNo);
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

            query.last("LIMIT 15");

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
