package com.fashion.supplychain.intelligence.agent.tool;

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
 * 撤回扫码记录工具 — 让管理者通过小云AI对话撤回错误的扫码记录。
 * 业务规则：工资已结算/下一环节已扫码/超时 均会被拒绝。
 */
@Slf4j
@Component
public class ScanUndoTool extends AbstractAgentTool {

    @Autowired private ScanRecordOrchestrator scanRecordOrchestrator;
    @Autowired private ScanRecordService scanRecordService;
    @Autowired private ProductionOrderService productionOrderService;

    @Override
    public String getName() {
        return "tool_scan_undo";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("recordId", stringProp("扫码记录ID（优先使用，最精确的撤回方式）"));
        properties.put("scanCode", stringProp("扫码码值/菲号"));
        properties.put("scanType", stringProp("扫码类型：production/cutting/quality"));
        properties.put("progressStage", stringProp("生产阶段名称（如：车缝、尾部、裁剪）"));
        properties.put("processCode", stringProp("工序编码"));
        properties.put("quantity", intProp("撤回数量（质检入库撤回时需要）"));

        return buildToolDef(
                "撤回扫码记录。当用户说'撤回刚才的扫码'、'撤销那条记录'时调用。"
                        + "工资已结算/下一环节已扫码/超时的记录无法撤回。",
                properties, List.of());
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);

        String recordId = optionalString(args, "recordId");
        String scanCode = optionalString(args, "scanCode");

        if (recordId == null && scanCode == null) {
            return errorJson("请提供扫码记录ID或扫码码值（菲号），才能定位要撤回的记录");
        }

        // 工厂账号：校验扫码记录所属订单归属本工厂
        String userFactoryId = UserContext.factoryId();
        if (userFactoryId != null && recordId != null) {
            ScanRecord record = scanRecordService.getById(recordId);
            if (record != null && record.getOrderId() != null) {
                ProductionOrder order = productionOrderService.getById(record.getOrderId());
                if (order == null || !userFactoryId.equals(order.getFactoryId())) {
                    return errorJson("该扫码记录不属于您的工厂，无权撤回");
                }
            }
        }

        Map<String, Object> params = new HashMap<>();
        if (recordId != null) params.put("recordId", recordId);
        if (scanCode != null) params.put("scanCode", scanCode);
        String scanType = optionalString(args, "scanType");
        if (scanType != null) params.put("scanType", scanType);
        String progressStage = optionalString(args, "progressStage");
        if (progressStage != null) params.put("progressStage", progressStage);
        String processCode = optionalString(args, "processCode");
        if (processCode != null) params.put("processCode", processCode);
        Integer quantity = optionalInt(args, "quantity");
        if (quantity != null) params.put("quantity", quantity);

        Map<String, Object> result = scanRecordOrchestrator.undo(params);
        return MAPPER.writeValueAsString(result);
    }
}
