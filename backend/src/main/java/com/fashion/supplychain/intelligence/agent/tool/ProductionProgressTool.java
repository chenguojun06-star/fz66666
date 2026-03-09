package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
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

        Map<String, Object> startDateProp = new HashMap<>();
        startDateProp.put("type", "string");
        startDateProp.put("description", "创建时间起始日期(yyyy-MM-dd)，用于查询某段时间内的订单，例如查日报用今天日期，查周报用7天前日期");
        properties.put("startDate", startDateProp);

        Map<String, Object> endDateProp = new HashMap<>();
        endDateProp.put("type", "string");
        endDateProp.put("description", "创建时间结束日期(yyyy-MM-dd)，默认到今天");
        properties.put("endDate", endDateProp);

        Map<String, Object> limitProp = new HashMap<>();
        limitProp.put("type", "integer");
        limitProp.put("description", "返回最大条数(默认5，最大20)。生成报告时建议设为20以获取更多数据");
        properties.put("limit", limitProp);

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
            String startDate = (String) args.get("startDate");
            String endDate = (String) args.get("endDate");
            Integer limit = args.get("limit") instanceof Number ? ((Number) args.get("limit")).intValue() : 5;
            if (limit < 1) limit = 1;
            if (limit > 20) limit = 20;

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
            if (startDate != null && !startDate.isBlank()) {
                LocalDate sd = LocalDate.parse(startDate);
                query.ge("create_time", LocalDateTime.of(sd, LocalTime.MIN));
            }
            if (endDate != null && !endDate.isBlank()) {
                LocalDate ed = LocalDate.parse(endDate);
                query.le("create_time", LocalDateTime.of(ed, LocalTime.MAX));
            }
            Long tenantId = UserContext.tenantId();
            if (tenantId != null) {
                query.eq("tenant_id", tenantId);
            }
            query.eq("delete_flag", 0);
            query.orderByDesc("create_time");
            query.last("LIMIT " + limit);

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
