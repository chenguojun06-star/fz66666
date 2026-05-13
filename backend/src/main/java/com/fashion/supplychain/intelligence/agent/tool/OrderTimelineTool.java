package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Slf4j
@Component
@AgentToolDef(
        name = "tool_order_timeline",
        description = "订单操作时间线查询工具",
        domain = ToolDomain.PRODUCTION,
        timeoutMs = 15000
)
public class OrderTimelineTool extends AbstractAgentTool {

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    @Autowired
    private ProductionOrderService productionOrderService;

    @Override
    public String getName() {
        return "tool_order_timeline";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("orderNo", stringProp("订单号（如PO20260513001）"));
        properties.put("orderId", stringProp("订单ID（与orderNo二选一）"));
        return buildToolDef(
                "订单完整操作时间线查询工具。查询订单从下单到入库的所有操作记录，包括下单、采购、裁剪、二次工艺、车缝、入库、转厂、质检异常，以及每步的操作人和时间。可用于回答'这个订单经历什么''订单时间线''操作记录'等问题。",
                properties,
                List.of("orderNo"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String orderNo = optionalString(args, "orderNo");
        String orderId = optionalString(args, "orderId");

        ProductionOrder order = null;
        if (StringUtils.hasText(orderId)) {
            order = productionOrderService.getById(orderId);
        }
        if (order == null && StringUtils.hasText(orderNo)) {
            order = productionOrderService.getByOrderNo(orderNo);
        }

        if (order == null) {
            return errorJson("未找到该订单，请提供正确的订单号或订单ID。提示：用户可以问'订单号POxxx的时间线是什么'");
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("orderId", order.getId());
        result.put("orderNo", order.getOrderNo());
        result.put("styleNo", order.getStyleNo());
        result.put("status", order.getStatus());
        result.put("factoryName", order.getFactoryName());
        result.put("orderQuantity", order.getOrderQuantity());

        if (order.getOrderUnitPrice() != null) {
            result.put("orderUnitPrice", order.getOrderUnitPrice().toPlainString() + "元/件");
        }

        if (order.getActualStartDate() != null) {
            result.put("actualStartDate", order.getActualStartDate().format(FMT));
        }
        if (order.getActualEndDate() != null) {
            result.put("actualEndDate", order.getActualEndDate().format(FMT));
            Duration duration = Duration.between(order.getActualStartDate() != null ? order.getActualStartDate() : order.getCreateTime(),
                    order.getActualEndDate());
            result.put("totalDuration", duration.toDays() + "天" + duration.toHoursPart() + "小时");
        } else if (order.getActualStartDate() != null) {
            Duration elapsed = Duration.between(order.getActualStartDate(), LocalDateTime.now());
            result.put("elapsed", "已进行" + elapsed.toDays() + "天" + elapsed.toHoursPart() + "小时");
        }

        String remarks = order.getRemarks();
        if (StringUtils.hasText(remarks)) {
            StringBuilder timeline = new StringBuilder();
            String[] lines = remarks.split("\n");
            int count = 0;
            for (String line : lines) {
                line = line.trim();
                if (line.isEmpty()) continue;
                count++;
                timeline.append(count).append(". ").append(line).append("\n");
            }
            result.put("timeline", timeline.toString().trim());
            result.put("totalEvents", count);
        } else {
            result.put("timeline", "暂无操作记录");
            result.put("totalEvents", 0);
        }

        return successJson("查询成功", result);
    }
}