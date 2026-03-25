package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseDocOrchestrator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class MaterialDocReceiveTool implements AgentTool {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired private MaterialPurchaseDocOrchestrator materialPurchaseDocOrchestrator;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", schema("string", "动作: replay_saved_doc | auto_arrival | auto_arrival_inbound"));
        properties.put("docId", schema("string", "采购单据记录ID，可选"));
        properties.put("orderNo", schema("string", "订单号；不传 docId 时必填，将使用该订单最新单据"));
        properties.put("warehouseLocation", schema("string", "自动入库时的仓位，不传默认仓"));
        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("处理已上传的采购单据识别结果。支持回放最新识别结果，并根据识别出的匹配行自动登记到货或自动到货入库。用户说“按最新采购单据自动收货”“根据这张单据直接到货入库”时必须调用。");
        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of("action"));
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        Map<String, Object> args = MAPPER.readValue(argumentsJson == null || argumentsJson.isBlank() ? "{}" : argumentsJson, new TypeReference<Map<String, Object>>() {});
        String action = text(args.get("action"));
        String docId = text(args.get("docId"));
        String orderNo = text(args.get("orderNo"));
        String warehouseLocation = text(args.get("warehouseLocation"));
        Object result = switch (action) {
            case "replay_saved_doc" -> materialPurchaseDocOrchestrator.replaySavedDoc(docId, orderNo);
            case "auto_arrival" -> materialPurchaseDocOrchestrator.autoExecuteSavedDoc(docId, orderNo, warehouseLocation, false);
            case "auto_arrival_inbound" -> materialPurchaseDocOrchestrator.autoExecuteSavedDoc(docId, orderNo, warehouseLocation == null || warehouseLocation.isBlank() ? "默认仓" : warehouseLocation, true);
            default -> Map.of("error", "不支持的 action");
        };
        return MAPPER.writeValueAsString(result);
    }

    @Override
    public String getName() {
        return "tool_material_doc_receive";
    }

    private Map<String, Object> schema(String type, String description) {
        Map<String, Object> field = new LinkedHashMap<>();
        field.put("type", type);
        field.put("description", description);
        return field;
    }

    private String text(Object value) {
        return value == null ? null : String.valueOf(value).trim();
    }
}
