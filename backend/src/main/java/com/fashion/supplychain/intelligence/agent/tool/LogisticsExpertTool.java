package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.DeliveryPredictionRequest;
import com.fashion.supplychain.intelligence.dto.DeliveryPredictionResponse;
import com.fashion.supplychain.intelligence.orchestration.DeliveryPredictionOrchestrator;
import com.fashion.supplychain.production.entity.FactoryShipment;
import com.fashion.supplychain.production.service.FactoryShipmentService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@AgentToolDef(name = "tool_logistics_expert", description = "物流专家工具", domain = ToolDomain.PRODUCTION, timeoutMs = 15000)
@McpToolAnnotation(
        name = "tool_logistics_expert",
        description = "物流专家工具",
        domain = ToolDomain.PRODUCTION,
        readOnly = true,
        timeoutSeconds = 15,
        requiresConfirmation = false,
        tags = {"物流", "出货追踪", "交期预测", "物流状态", "发货查询"}
)
public class LogisticsExpertTool extends AbstractAgentTool {

    @Autowired
    private FactoryShipmentService factoryShipmentService;

    @Autowired
    private DeliveryPredictionOrchestrator deliveryPredictionOrchestrator;

    @Override
    public String getName() {
        return "tool_logistics_expert";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.PRODUCTION;
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: shipment_tracking | delivery_prediction"));
        properties.put("orderNo", stringProp("订单号（shipment_tracking时可选）"));
        properties.put("status", stringProp("收货状态过滤（shipment_tracking时可选）: pending / partial / received"));
        properties.put("orderId", stringProp("订单ID（delivery_prediction时必填）"));
        properties.put("limit", intProp("返回条数，默认10"));
        return buildToolDef(
                "物流专家工具：查询出货/物流状态、交期预测。所有数据来自真实数据库查询，绝不编造。",
                properties, List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = requireString(args, "action");
        return switch (action) {
            case "shipment_tracking" -> shipmentTracking(args);
            case "delivery_prediction" -> deliveryPrediction(args);
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String shipmentTracking(Map<String, Object> args) throws Exception {
        Long tenantId = UserContext.tenantId();
        String orderNo = optionalString(args, "orderNo");
        String status = optionalString(args, "status");
        int limit = optionalInt(args, "limit") != null ? optionalInt(args, "limit") : 10;

        LambdaQueryWrapper<FactoryShipment> query = new LambdaQueryWrapper<FactoryShipment>()
                .eq(FactoryShipment::getTenantId, tenantId)
                .eq(FactoryShipment::getDeleteFlag, 0)
                .eq(StringUtils.hasText(orderNo), FactoryShipment::getOrderNo, orderNo)
                .eq(StringUtils.hasText(status), FactoryShipment::getReceiveStatus, status)
                .orderByDesc(FactoryShipment::getShipTime)
                .last("LIMIT " + limit);

        List<FactoryShipment> items = factoryShipmentService.list(query);
        if (items.isEmpty()) {
            return successJson("系统中暂无匹配的出货/物流数据", Map.of("items", List.of(), "total", 0));
        }

        List<Map<String, Object>> dtoList = items.stream().map(s -> {
            Map<String, Object> dto = new LinkedHashMap<>();
            dto.put("shipmentNo", s.getShipmentNo());
            dto.put("orderNo", s.getOrderNo());
            dto.put("styleNo", s.getStyleNo());
            dto.put("styleName", s.getStyleName());
            dto.put("factoryName", s.getFactoryName());
            dto.put("shipQuantity", s.getShipQuantity());
            dto.put("receivedQuantity", s.getReceivedQuantity());
            dto.put("shipTime", s.getShipTime());
            dto.put("shippedByName", s.getShippedByName());
            dto.put("trackingNo", s.getTrackingNo());
            dto.put("expressCompany", s.getExpressCompany());
            dto.put("shipMethod", s.getShipMethod());
            dto.put("receiveStatus", s.getReceiveStatus());
            dto.put("receiveTime", s.getReceiveTime());
            dto.put("receivedByName", s.getReceivedByName());
            return dto;
        }).toList();

        return successJson("出货/物流查询结果", Map.of("items", dtoList, "total", dtoList.size()));
    }

    private String deliveryPrediction(Map<String, Object> args) {
        try {
            String orderId = optionalString(args, "orderId");
            if (!StringUtils.hasText(orderId)) {
                return errorJson("delivery_prediction 需要提供 orderId 参数");
            }

            DeliveryPredictionRequest request = new DeliveryPredictionRequest();
            request.setOrderId(orderId);
            DeliveryPredictionResponse resp = deliveryPredictionOrchestrator.predict(request);

            if (resp.getRationale() != null && resp.getRationale().contains("不存在")) {
                return successJson("系统中暂无该订单的交期预测数据", Map.of("prediction", Map.of()));
            }

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("orderId", resp.getOrderId());
            result.put("orderNo", resp.getOrderNo());
            result.put("optimisticDate", resp.getOptimisticDate());
            result.put("mostLikelyDate", resp.getMostLikelyDate());
            result.put("pessimisticDate", resp.getPessimisticDate());
            result.put("dailyVelocity", resp.getDailyVelocity());
            result.put("remainingQty", resp.getRemainingQty());
            result.put("plannedDeadline", resp.getPlannedDeadline());
            result.put("likelyDelayed", resp.isLikelyDelayed());
            result.put("confidence", resp.getConfidence());
            result.put("rationale", resp.getRationale());

            return successJson("交期预测结果", Map.of("prediction", result));
        } catch (Exception e) {
            log.error("[LogisticsExpertTool.delivery_prediction] 异常: {}", e.getMessage(), e);
            return errorJson("交期预测查询失败: " + e.getMessage());
        }
    }
}
