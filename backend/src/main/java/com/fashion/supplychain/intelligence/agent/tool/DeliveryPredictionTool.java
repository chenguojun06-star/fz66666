package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.DeliveryPredictionRequest;
import com.fashion.supplychain.intelligence.dto.DeliveryPredictionResponse;
import com.fashion.supplychain.intelligence.orchestration.DeliveryPredictionOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

@Slf4j
@Component
public class DeliveryPredictionTool extends AbstractAgentTool {

    @Autowired
    private DeliveryPredictionOrchestrator deliveryPredictionOrchestrator;

    private static final ObjectMapper JSON = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_delivery_prediction";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("order_id", prop("string",
                "订单号或订单ID，如 PO20260228001 或 20260228001"));
        AiTool tool = new AiTool();
        AiTool.AiFunction fn = new AiTool.AiFunction();
        fn.setName(getName());
        fn.setDescription("交期预测工具：基于近7天加权移动平均产量+P80历史百分位+工厂校准，预测订单完工日期（乐观/可能/悲观三档），判断是否延期。"
                + "当用户问\"这个订单能不能按时交\"\"什么时候能做完\"\"交期预测\"\"会不会延期\"时调用此工具。");
        AiTool.AiParameters params = new AiTool.AiParameters();
        params.setProperties(props);
        params.setRequired(List.of("order_id"));
        fn.setParameters(params);
        tool.setFunction(fn);
        return tool;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        try {
            JsonNode args = JSON.readTree(argumentsJson);
            String orderId = args.path("order_id").asText("").trim();
            if (orderId.isEmpty()) {
                return errorJson("缺少订单号");
            }

            log.info("[DeliveryPredictionTool] 预测订单={}", orderId);

            DeliveryPredictionRequest req = new DeliveryPredictionRequest();
            req.setOrderId(orderId);
            DeliveryPredictionResponse resp = deliveryPredictionOrchestrator.predict(req);

            Map<String, Object> result = new LinkedHashMap<>();
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

            if (resp.isLikelyDelayed()) {
                result.put("alert", "⚠️ 预计延期！最可能完工日 " + resp.getMostLikelyDate()
                        + " 晚于计划交期 " + resp.getPlannedDeadline());
            }

            return JSON.writeValueAsString(result);
        } catch (Exception e) {
            log.error("[DeliveryPredictionTool] 预测异常", e);
            return errorJson("交期预测失败: " + e.getMessage());
        }
    }
}
