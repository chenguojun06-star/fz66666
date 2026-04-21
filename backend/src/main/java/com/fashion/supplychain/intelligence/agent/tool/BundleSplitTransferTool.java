package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.production.dto.CuttingBundleSplitRollbackRequest;
import com.fashion.supplychain.production.dto.CuttingBundleSplitTransferRequest;
import com.fashion.supplychain.production.orchestration.CuttingBundleSplitTransferOrchestrator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class BundleSplitTransferTool implements AgentTool {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Autowired
    private CuttingBundleSplitTransferOrchestrator cuttingBundleSplitTransferOrchestrator;

    @Autowired
    private AiAgentToolAccessService aiAgentToolAccessService;

    @Override
    public String getName() {
        return "tool_bundle_split_transfer";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", schema("string", "动作: split_transfer | rollback_split | query_family"));
        properties.put("bundleId", schema("string", "菲号ID"));
        properties.put("qrCode", schema("string", "菲号二维码内容"));
        properties.put("orderNo", schema("string", "订单号"));
        properties.put("bundleNo", schema("integer", "原始菲号数字编号"));
        properties.put("currentProcessName", schema("string", "当前工序名称，例如车缝"));
        properties.put("completedQuantity", schema("integer", "原工人已完成数量"));
        properties.put("transferQuantity", schema("integer", "要转给下一位工人的数量"));
        properties.put("toWorkerId", schema("string", "目标工人ID"));
        properties.put("toWorkerName", schema("string", "目标工人姓名"));
        properties.put("reason", schema("string", "转派原因"));
        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("拆菲转派工具。用于拆菲转派、查询拆分家族关系，以及在未继续流转时撤回拆菲，让数据自动归回原有菲号。");
        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of("action"));
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String arguments) {
        try {
            if (!aiAgentToolAccessService.hasManagerAccess()) {
                return "{\"success\":false,\"error\":\"当前角色无权执行该操作\"}";
            }
            Map<String, Object> args = OBJECT_MAPPER.readValue(arguments, new TypeReference<Map<String, Object>>() {});
            String action = asString(args.get("action"));
            if ("query_family".equalsIgnoreCase(action)) {
                return OBJECT_MAPPER.writeValueAsString(cuttingBundleSplitTransferOrchestrator.queryFamily(asString(args.get("bundleId"))));
            }
            if ("rollback_split".equalsIgnoreCase(action)) {
                CuttingBundleSplitRollbackRequest request = new CuttingBundleSplitRollbackRequest();
                request.setBundleId(asString(args.get("bundleId")));
                request.setQrCode(asString(args.get("qrCode")));
                request.setOrderNo(asString(args.get("orderNo")));
                request.setBundleNo(asInteger(args.get("bundleNo")));
                request.setReason(asString(args.get("reason")));
                return OBJECT_MAPPER.writeValueAsString(cuttingBundleSplitTransferOrchestrator.rollbackSplit(request));
            }
            CuttingBundleSplitTransferRequest request = new CuttingBundleSplitTransferRequest();
            request.setBundleId(asString(args.get("bundleId")));
            request.setQrCode(asString(args.get("qrCode")));
            request.setOrderNo(asString(args.get("orderNo")));
            request.setBundleNo(asInteger(args.get("bundleNo")));
            request.setCurrentProcessName(asString(args.get("currentProcessName")));
            request.setCompletedQuantity(asInteger(args.get("completedQuantity")));
            request.setTransferQuantity(asInteger(args.get("transferQuantity")));
            request.setToWorkerId(asString(args.get("toWorkerId")));
            request.setToWorkerName(asString(args.get("toWorkerName")));
            request.setReason(asString(args.get("reason")));
            return OBJECT_MAPPER.writeValueAsString(cuttingBundleSplitTransferOrchestrator.splitAndTransfer(request));
        } catch (Exception e) {
            log.error("tool_bundle_split_transfer 执行失败", e);
            return "{\"success\":false,\"error\":\"" + e.getMessage().replace("\"", "'") + "\"}";
        }
    }

    private Map<String, Object> schema(String type, String description) {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", type);
        schema.put("description", description);
        return schema;
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value).trim();
    }

    private Integer asInteger(Object value) {
        if (value == null) return null;
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (Exception e) {
            return null;
        }
    }
}
