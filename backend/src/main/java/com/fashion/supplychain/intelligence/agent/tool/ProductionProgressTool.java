package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 生产进度与订单查询工具
 */
@Slf4j
@Component
public class ProductionProgressTool implements AgentTool {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_query_production_progress";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new HashMap<>();

        Map<String, Object> orderNoProp = new HashMap<>();
        orderNoProp.put("type", "string");
        orderNoProp.put("description", "生产订单号，例如 PO2024001");
        properties.put("orderNo", orderNoProp);

        Map<String, Object> styleNoProp = new HashMap<>();
        styleNoProp.put("type", "string");
        styleNoProp.put("description", "款号，例如 D2024001");
        properties.put("styleNo", styleNoProp);

        Map<String, Object> statusProp = new HashMap<>();
        statusProp.put("type", "string");
        statusProp.put("description", "订单状态，如 IN_PROGRESS, COMPLETED");
        properties.put("status", statusProp);

        Map<String, Object> queryScanRecordsProp = new HashMap<>();
        queryScanRecordsProp.put("type", "boolean");
        queryScanRecordsProp.put("description", "是否查询该订单最新的工序扫码记录");
        properties.put("queryScanRecords", queryScanRecordsProp);

        Map<String, Object> parameters = new HashMap<>();
        parameters.put("type", "object");
        parameters.put("properties", properties);
        // 不强制要求必填项，允许不带参数查询最新的进行中订单

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("按条件查询生产订单(ProductionOrder)及生产进度(Progress)详情、相关工序扫码记录。");
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
                args = objectMapper.readValue(argumentsJson, new TypeReference<Map<String, Object>>() {});
            }

            String orderNo = (String) args.get("orderNo");
            String styleNo = (String) args.get("styleNo");
            String status = (String) args.get("status");
            Boolean queryScanRecords = (Boolean) args.get("queryScanRecords");

            QueryWrapper<ProductionOrder> query = new QueryWrapper<>();
            if (orderNo != null && !orderNo.isBlank()) {
                query.eq("order_no", orderNo);
            }
            if (styleNo != null && !styleNo.isBlank()) {
                query.eq("style_no", styleNo);
            }
            if (status != null && !status.isBlank()) {
                query.eq("status", status);
            }
            query.orderByDesc("create_time");
            query.last("LIMIT 5"); // 避免返回过多，最大返回5条

            List<ProductionOrder> orders = productionOrderService.list(query);

            if (orders.isEmpty()) {
                return "{\"message\": \"未查询到符合条件的生产订单数据\"}";
            }

            List<Map<String, Object>> resultList = new ArrayList<>();
            DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

            for (ProductionOrder order : orders) {
                Map<String, Object> orderDto = new HashMap<>();
                orderDto.put("orderId", order.getId());
                orderDto.put("orderNo", order.getOrderNo());
                orderDto.put("styleNo", order.getStyleNo());
                orderDto.put("styleName", order.getStyleName());
                orderDto.put("factoryName", order.getFactoryName());
                orderDto.put("orderQuantity", order.getOrderQuantity());
                orderDto.put("cuttingQuantity", order.getCuttingQuantity());
                orderDto.put("completedQuantity", order.getCompletedQuantity());
                orderDto.put("productionProgress", order.getProductionProgress());
                orderDto.put("status", order.getStatus());
                if (order.getCreateTime() != null) {
                    orderDto.put("createTime", order.getCreateTime().format(dtf));
                }

                if (Boolean.TRUE.equals(queryScanRecords)) {
                    // 查询最近的扫码记录
                    QueryWrapper<ScanRecord> scanQuery = new QueryWrapper<>();
                    scanQuery.eq("order_id", order.getId());
                    scanQuery.eq("scan_result", "success");
                    scanQuery.orderByDesc("scan_time");
                    scanQuery.last("LIMIT 10"); // 返回最新的10条

                    List<ScanRecord> scanRecords = scanRecordService.list(scanQuery);
                    List<Map<String, Object>> scansDto = new ArrayList<>();

                    for (ScanRecord scan : scanRecords) {
                        Map<String, Object> scanDto = new HashMap<>();
                        scanDto.put("processName", scan.getProcessName());
                        scanDto.put("operatorName", scan.getOperatorName());
                        scanDto.put("quantity", scan.getQuantity());
                        if (scan.getScanTime() != null) {
                            scanDto.put("scanTime", scan.getScanTime().format(dtf));
                        }
                        scansDto.add(scanDto);
                    }
                    orderDto.put("latestScanRecords", scansDto);
                }

                resultList.add(orderDto);
            }

            return objectMapper.writeValueAsString(resultList);

        } catch (JsonProcessingException e) {
            log.error("Tool execution failed: parse json error", e);
            return "{\"error\": \"参数解析异常\"}";
        } catch (Exception e) {
            log.error("Tool execution failed", e);
            return "{\"error\": \"查询失败: " + e.getMessage() + "\"}";
        }
    }
}
