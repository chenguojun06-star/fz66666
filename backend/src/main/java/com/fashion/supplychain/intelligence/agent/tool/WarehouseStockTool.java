package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.service.MaterialStockService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 仓库进销存查询工具（主要是面辅料库存查询）
 */
@Slf4j
@Component
public class WarehouseStockTool implements AgentTool {

    @Autowired
    private MaterialStockService materialStockService;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_query_warehouse_stock";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new HashMap<>();

        Map<String, Object> materialTypeProp = new HashMap<>();
        materialTypeProp.put("type", "string");
        materialTypeProp.put("description", "物料类型，例如 FABRIC(面料), EXCIPIENT(辅料)");
        properties.put("materialType", materialTypeProp);

        Map<String, Object> materialNameProp = new HashMap<>();
        materialNameProp.put("type", "string");
        materialNameProp.put("description", "物料名称关键词，例如 '棉' 或 '拉链'");
        properties.put("materialName", materialNameProp);

        Map<String, Object> colorProp = new HashMap<>();
        colorProp.put("type", "string");
        colorProp.put("description", "颜色，例如 '红色', '黑色'");
        properties.put("color", colorProp);

        Map<String, Object> supplierNameProp = new HashMap<>();
        supplierNameProp.put("type", "string");
        supplierNameProp.put("description", "供应商名称");
        properties.put("supplierName", supplierNameProp);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("按条件查询仓库中的面辅料库存数据(进销存)。返回物料名、库存数量、锁定数量、单价等。");
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

            String materialType = (String) args.get("materialType");
            String materialName = (String) args.get("materialName");
            String color = (String) args.get("color");
            String supplierName = (String) args.get("supplierName");

            QueryWrapper<MaterialStock> query = new QueryWrapper<>();
            if (materialType != null && !materialType.isBlank()) {
                query.eq("material_type", materialType);
            }
            if (materialName != null && !materialName.isBlank()) {
                query.like("material_name", materialName);
            }
            if (color != null && !color.isBlank()) {
                query.eq("color", color);
            }
            if (supplierName != null && !supplierName.isBlank()) {
                query.like("supplier_name", supplierName);
            }
            TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
            query.eq("tenant_id", tenantId);

            // 为了防止数据过多，我们只拉取前10条
            query.last("LIMIT 10");

            List<MaterialStock> stocks = materialStockService.list(query);
            if (stocks.isEmpty()) {
                return "{\"message\": \"未查询到相应的库存数据\"}";
            }

            List<Map<String, Object>> resultList = new ArrayList<>();
            for (MaterialStock stock : stocks) {
                Map<String, Object> dto = new HashMap<>();
                dto.put("materialName", stock.getMaterialName());
                dto.put("materialType", stock.getMaterialType());
                dto.put("color", stock.getColor());
                dto.put("size", stock.getSize());
                dto.put("supplierName", stock.getSupplierName());
                dto.put("quantity", stock.getQuantity()); // 实际可用库存
                dto.put("lockedQuantity", stock.getLockedQuantity()); // 锁定库存
                dto.put("unitPrice", stock.getUnitPrice());
                dto.put("unit", stock.getUnit());
                dto.put("location", stock.getLocation());
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
