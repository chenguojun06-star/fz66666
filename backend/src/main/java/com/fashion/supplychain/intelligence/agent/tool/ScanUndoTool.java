package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.helper.StepWizardBuilder;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
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
    @Autowired private AiAgentToolAccessService aiAgentToolAccessService;

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
        if (!aiAgentToolAccessService.hasManagerAccess()) {
            return errorJson("当前角色无权执行该操作");
        }
        Map<String, Object> args = parseArgs(argumentsJson);

        String recordId = optionalString(args, "recordId");
        String scanCode = optionalString(args, "scanCode");

        if (recordId == null && scanCode == null) {
            Map<String, Object> wizard = StepWizardBuilder.build("scan_undo", "扫码撤回", "选择要撤回的扫码记录", "↩️", "确认撤回", "撤回扫码",
                StepWizardBuilder.steps(
                    StepWizardBuilder.step("locate", "定位记录", "输入扫码记录ID或菲号码值",
                        StepWizardBuilder.textField("scanCode", "菲号/码值", false, "扫描的菲号或码值"),
                        StepWizardBuilder.textField("recordId", "记录ID", false, "扫码记录ID（如有）"))
                ));
            try { return MAPPER.writeValueAsString(StepWizardBuilder.wrapResult("请提供扫码记录ID或菲号", true, List.of("recordId或scanCode"), "请补充要撤回的扫码记录信息", wizard)); } catch (Exception e) { return errorJson("请提供扫码记录ID或扫码码值"); }
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
