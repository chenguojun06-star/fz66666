package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestrator;
import com.fashion.supplychain.procurement.orchestration.ProcurementOrchestrator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Slf4j
@Component
public class MaterialReceiveTool implements AgentTool {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired private MaterialPurchaseOrchestrator materialPurchaseOrchestrator;
    @Autowired private ProcurementOrchestrator procurementOrchestrator;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", schema("string", "动作: preview_smart_receive | smart_receive_all | receive_purchase | batch_receive | warehouse_pick | update_arrived_quantity | confirm_arrival | cancel_receive"));
        properties.put("orderNo", schema("string", "订单号，智能收货时使用"));
        properties.put("purchaseId", schema("string", "采购单ID"));
        properties.put("purchaseIds", schema("array", "采购单ID数组，批量领取时使用"));
        properties.put("pickQty", schema("integer", "仓库单项领取数量"));
        properties.put("arrivedQuantity", schema("integer", "到货数量"));
        properties.put("warehouseLocation", schema("string", "入库仓位"));
        properties.put("remark", schema("string", "备注"));
        properties.put("reason", schema("string", "撤回原因"));
        properties.put("receiverId", schema("string", "领取人ID，可选，不传默认当前用户"));
        properties.put("receiverName", schema("string", "领取人姓名，可选，不传默认当前用户"));

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("处理面辅料到货、入库、领取和智能收货。支持查看智能收货预览、一键智能收货、单条领取、仓库单项领取、更新到货数量、到货并入库、撤回收货。当用户说“看看这单能不能智能收货”“把这张采购单登记到货”“这张面料直接到货入库”“帮我一键收完这单面辅料”时必须调用。");
        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of("action"));
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        if (UserContext.tenantId() == null) {
            return "{\"success\":false,\"error\":\"租户上下文丢失，请重新登录\"}";
        }
        Map<String, Object> args = MAPPER.readValue(argumentsJson == null || argumentsJson.isBlank() ? "{}" : argumentsJson, new TypeReference<Map<String, Object>>() {});
        String action = text(args.get("action"));
        return switch (action) {
            case "preview_smart_receive" -> previewSmartReceive(args);
            case "smart_receive_all" -> smartReceiveAll(args);
            case "receive_purchase" -> receivePurchase(args);
            case "batch_receive" -> batchReceive(args);
            case "warehouse_pick" -> warehousePick(args);
            case "update_arrived_quantity" -> updateArrivedQuantity(args);
            case "confirm_arrival" -> confirmArrival(args);
            case "cancel_receive" -> cancelReceive(args);
            default -> "{\"error\":\"不支持的 action\"}";
        };
    }

    @Override
    public String getName() {
        return "tool_material_receive";
    }

    private String previewSmartReceive(Map<String, Object> args) throws Exception {
        String orderNo = required(args, "orderNo");
        Object result = materialPurchaseOrchestrator.previewSmartReceive(orderNo);
        return ok("已返回该订单的智能收货预览", Map.of("orderNo", orderNo, "result", result));
    }

    private String smartReceiveAll(Map<String, Object> args) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("orderNo", required(args, "orderNo"));
        body.put("receiverId", defaultReceiverId(args));
        body.put("receiverName", defaultReceiverName(args));
        Map<String, Object> result = materialPurchaseOrchestrator.smartReceiveAll(body);
        return ok("已执行智能一键收货", Map.of("orderNo", body.get("orderNo"), "result", result));
    }

    private String receivePurchase(Map<String, Object> args) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("purchaseId", required(args, "purchaseId"));
        body.put("receiverId", defaultReceiverId(args));
        body.put("receiverName", defaultReceiverName(args));
        MaterialPurchase purchase = materialPurchaseOrchestrator.receive(body);
        return ok("已领取该面辅料采购任务", Map.of("purchase", toPurchaseDto(purchase)));
    }

    private String batchReceive(Map<String, Object> args) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("purchaseIds", args.get("purchaseIds"));
        body.put("receiverId", defaultReceiverId(args));
        body.put("receiverName", defaultReceiverName(args));
        Map<String, Object> result = materialPurchaseOrchestrator.batchReceive(body);
        return ok("已执行批量领取", Map.of("result", result));
    }

    private String warehousePick(Map<String, Object> args) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("purchaseId", required(args, "purchaseId"));
        body.put("pickQty", intRequired(args, "pickQty"));
        body.put("receiverId", defaultReceiverId(args));
        body.put("receiverName", defaultReceiverName(args));
        Map<String, Object> result = materialPurchaseOrchestrator.warehousePickSingle(body);
        return ok("已执行仓库单项领取", Map.of("result", result));
    }

    private String updateArrivedQuantity(Map<String, Object> args) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", required(args, "purchaseId"));
        body.put("arrivedQuantity", intRequired(args, "arrivedQuantity"));
        body.put("remark", text(args.get("remark")));
        boolean success = procurementOrchestrator.updateArrivedQuantity(body);
        return ok("已更新到货数量", Map.of("success", success, "purchaseId", body.get("id"), "arrivedQuantity", body.get("arrivedQuantity")));
    }

    private String confirmArrival(Map<String, Object> args) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("purchaseId", required(args, "purchaseId"));
        body.put("arrivedQuantity", intRequired(args, "arrivedQuantity"));
        body.put("warehouseLocation", StringUtils.hasText(text(args.get("warehouseLocation"))) ? text(args.get("warehouseLocation")) : "默认仓");
        body.put("operatorId", defaultReceiverId(args));
        body.put("operatorName", defaultReceiverName(args));
        body.put("remark", text(args.get("remark")));
        Map<String, Object> result = procurementOrchestrator.confirmArrivalAndInbound(body);
        return ok("已完成到货并入库", Map.of("result", result));
    }

    private String cancelReceive(Map<String, Object> args) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("purchaseId", required(args, "purchaseId"));
        body.put("reason", text(args.get("reason")));
        Map<String, Object> result = procurementOrchestrator.cancelReceive(body);
        return ok("已撤回该采购领取/到货记录", Map.of("result", result));
    }

    private Map<String, Object> toPurchaseDto(MaterialPurchase item) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", item.getId());
        dto.put("purchaseNo", item.getPurchaseNo());
        dto.put("orderNo", item.getOrderNo());
        dto.put("materialName", item.getMaterialName());
        dto.put("materialCode", item.getMaterialCode());
        dto.put("status", item.getStatus());
        dto.put("receiverName", item.getReceiverName());
        dto.put("arrivedQuantity", item.getArrivedQuantity());
        dto.put("purchaseQuantity", item.getPurchaseQuantity());
        return dto;
    }

    private String defaultReceiverId(Map<String, Object> args) {
        String value = text(args.get("receiverId"));
        return StringUtils.hasText(value) ? value : UserContext.userId();
    }

    private String defaultReceiverName(Map<String, Object> args) {
        String value = text(args.get("receiverName"));
        return StringUtils.hasText(value) ? value : UserContext.username();
    }

    private String ok(String summary, Map<String, Object> payload) throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", summary);
        result.putAll(payload);
        return MAPPER.writeValueAsString(result);
    }

    private Map<String, Object> schema(String type, String description) {
        Map<String, Object> field = new LinkedHashMap<>();
        field.put("type", type);
        field.put("description", description);
        return field;
    }

    private String required(Map<String, Object> args, String key) {
        String value = text(args.get(key));
        if (!StringUtils.hasText(value)) throw new IllegalArgumentException("缺少参数: " + key);
        return value;
    }

    private int intRequired(Map<String, Object> args, String key) {
        String value = required(args, key);
        return Integer.parseInt(value);
    }

    private String text(Object value) {
        return value == null ? null : String.valueOf(value).trim();
    }
}
