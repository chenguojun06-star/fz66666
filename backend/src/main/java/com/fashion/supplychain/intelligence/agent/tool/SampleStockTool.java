package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.stock.entity.SampleStock;
import com.fashion.supplychain.stock.service.SampleStockService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 样衣库存查询工具 — 供 AI 顾问调用
 * 查询 t_sample_stock 表：开发样/产前样/大货样/销售样
 */
@Slf4j
@Component
public class SampleStockTool implements AgentTool {

    @Autowired
    private SampleStockService sampleStockService;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_sample_stock";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new HashMap<>();

        Map<String, Object> sampleTypeProp = new HashMap<>();
        sampleTypeProp.put("type", "string");
        sampleTypeProp.put("description", "样衣类型：development(开发样), pre_production(产前样), shipment(大货样), sales(销售样)");
        properties.put("sampleType", sampleTypeProp);

        Map<String, Object> styleNoProp = new HashMap<>();
        styleNoProp.put("type", "string");
        styleNoProp.put("description", "款号关键词，例如 'FZ2024'");
        properties.put("styleNo", styleNoProp);

        Map<String, Object> styleNameProp = new HashMap<>();
        styleNameProp.put("type", "string");
        styleNameProp.put("description", "款式名称关键词");
        properties.put("styleName", styleNameProp);

        Map<String, Object> colorProp = new HashMap<>();
        colorProp.put("type", "string");
        colorProp.put("description", "颜色，例如 '红色', '黑色'");
        properties.put("color", colorProp);

        Map<String, Object> sizeProp = new HashMap<>();
        sizeProp.put("type", "string");
        sizeProp.put("description", "尺码，例如 'M', 'XL'");
        properties.put("size", sizeProp);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("查询样衣库存数据。返回款号、款名、样衣类型、颜色、尺码、库存数量、借出数量、存放位置等。");
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

            String sampleType = (String) args.get("sampleType");
            String styleNo = (String) args.get("styleNo");
            String styleName = (String) args.get("styleName");
            String color = (String) args.get("color");
            String size = (String) args.get("size");

            QueryWrapper<SampleStock> query = new QueryWrapper<>();
            query.eq("delete_flag", 0);

            if (sampleType != null && !sampleType.isBlank()) {
                query.eq("sample_type", sampleType);
            }
            if (styleNo != null && !styleNo.isBlank()) {
                query.like("style_no", styleNo);
            }
            if (styleName != null && !styleName.isBlank()) {
                query.like("style_name", styleName);
            }
            if (color != null && !color.isBlank()) {
                query.eq("color", color);
            }
            if (size != null && !size.isBlank()) {
                query.eq("size", size);
            }

            Long tenantId = UserContext.tenantId();
            if (tenantId != null) {
                query.eq("tenant_id", tenantId);
            }

            query.last("LIMIT 15");

            List<SampleStock> stocks = sampleStockService.list(query);
            if (stocks.isEmpty()) {
                return "{\"message\": \"未查询到样衣库存数据\"}";
            }

            List<Map<String, Object>> resultList = new ArrayList<>();
            for (SampleStock s : stocks) {
                Map<String, Object> dto = new HashMap<>();
                dto.put("styleNo", s.getStyleNo());
                dto.put("styleName", s.getStyleName());
                dto.put("sampleType", s.getSampleType());
                dto.put("color", s.getColor());
                dto.put("size", s.getSize());
                dto.put("quantity", s.getQuantity());
                dto.put("loanedQuantity", s.getLoanedQuantity());
                dto.put("availableQuantity", (s.getQuantity() != null ? s.getQuantity() : 0)
                        - (s.getLoanedQuantity() != null ? s.getLoanedQuantity() : 0));
                dto.put("location", s.getLocation());
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
