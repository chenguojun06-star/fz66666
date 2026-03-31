package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.orchestration.ScanRecordOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * 撤回扫码记录工具 — 让管理者通过小云AI对话撤回错误的扫码记录
 * 支持操作：undo(撤回指定扫码记录)
 * 业务规则：工资已结算/下一环节已扫码/超时 均会被拒绝
 */
@Slf4j
@Component
public class ScanUndoTool implements AgentTool {

    @Autowired
    private ScanRecordOrchestrator scanRecordOrchestrator;

    @Autowired
    private ScanRecordService scanRecordService;

    @Autowired
    private ProductionOrderService productionOrderService;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_scan_undo";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> recordId = new LinkedHashMap<>();
        recordId.put("type", "string");
        recordId.put("description", "扫码记录ID（优先使用，最精确的撤回方式）");
        properties.put("recordId", recordId);

        Map<String, Object> scanCode = new LinkedHashMap<>();
        scanCode.put("type", "string");
        scanCode.put("description", "扫码码值/菲号（如用户说'撤回刚才扫的那个菲号'时使用）");
        properties.put("scanCode", scanCode);

        Map<String, Object> scanType = new LinkedHashMap<>();
        scanType.put("type", "string");
        scanType.put("description", "扫码类型：production(生产)/cutting(裁剪)/quality(质检)，缩小查找范围");
        properties.put("scanType", scanType);

        Map<String, Object> progressStage = new LinkedHashMap<>();
        progressStage.put("type", "string");
        progressStage.put("description", "生产阶段名称（如：车缝、尾部、裁剪），进一步缩小查找范围");
        properties.put("progressStage", progressStage);

        Map<String, Object> processCode = new LinkedHashMap<>();
        processCode.put("type", "string");
        processCode.put("description", "工序编码，用于精确匹配具体工序的扫码记录");
        properties.put("processCode", processCode);

        Map<String, Object> quantity = new LinkedHashMap<>();
        quantity.put("type", "integer");
        quantity.put("description", "撤回数量（质检入库撤回时需要）");
        properties.put("quantity", quantity);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("撤回扫码记录工具。当用户说'撤回刚才的扫码'、'撤销那条扫码记录'、'把菲号XXX的扫码撤回'时调用。" +
                "注意：工资已结算的记录无法撤回；下一生产环节已扫码的记录无法撤回；普通用户只能撤回30分钟内的记录，管理员5小时。");

        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of()); // recordId 或 scanCode 至少提供一个
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        Map<String, Object> args = MAPPER.readValue(argumentsJson, new TypeReference<>() {});

        String recordId = (String) args.get("recordId");
        String scanCode = (String) args.get("scanCode");

        if ((recordId == null || recordId.isBlank()) && (scanCode == null || scanCode.isBlank())) {
            return MAPPER.writeValueAsString(Map.of(
                    "error", "请提供扫码记录ID或扫码码值（菲号），才能定位要撤回的记录"));
        }

        // 工厂账号：校验扫码记录所属订单归属本工厂
        String userFactoryId = UserContext.factoryId();
        if (userFactoryId != null && recordId != null && !recordId.isBlank()) {
            ScanRecord record = scanRecordService.getById(recordId.trim());
            if (record != null && record.getOrderId() != null) {
                ProductionOrder order = productionOrderService.getById(record.getOrderId());
                if (order == null || !userFactoryId.equals(order.getFactoryId())) {
                    return MAPPER.writeValueAsString(Map.of("error", "该扫码记录不属于您的工厂，无权撤回"));
                }
            }
        }

        try {
            Map<String, Object> params = new HashMap<>();
            if (recordId != null && !recordId.isBlank()) {
                params.put("recordId", recordId.trim());
            }
            if (scanCode != null && !scanCode.isBlank()) {
                params.put("scanCode", scanCode.trim());
            }
            if (args.get("scanType") != null) {
                params.put("scanType", args.get("scanType"));
            }
            if (args.get("progressStage") != null) {
                params.put("progressStage", args.get("progressStage"));
            }
            if (args.get("processCode") != null) {
                params.put("processCode", args.get("processCode"));
            }
            if (args.get("quantity") != null) {
                params.put("quantity", args.get("quantity"));
            }

            Map<String, Object> result = scanRecordOrchestrator.undo(params);
            return MAPPER.writeValueAsString(result);

        } catch (IllegalStateException e) {
            return MAPPER.writeValueAsString(Map.of(
                    "success", false,
                    "message", e.getMessage()));
        } catch (IllegalArgumentException e) {
            return MAPPER.writeValueAsString(Map.of(
                    "error", "参数错误：" + e.getMessage()));
        }
    }
}
