package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.helper.StepWizardBuilder;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.production.orchestration.ScanRecordOrchestrator;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

@Slf4j
@Component
@AgentToolDef(name = "tool_scan_undo", description = "撤回扫码记录", domain = ToolDomain.PRODUCTION, timeoutMs = 15000, readOnly = false)
public class ScanUndoTool extends AbstractAgentTool {

    @Autowired private ScanRecordOrchestrator scanRecordOrchestrator;
    @Autowired private AiAgentToolAccessService aiAgentToolAccessService;
    @Autowired private ScanRecordService scanRecordService;

    @Override
    public String getName() {
        return "tool_scan_undo";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("操作类型：preview(预览影响)/undo(执行撤回)，默认preview"));
        properties.put("recordId", stringProp("扫码记录ID"));
        properties.put("scanCode", stringProp("扫码码值/菲号"));
        properties.put("scanType", stringProp("扫码类型：production/cutting/quality"));
        properties.put("progressStage", stringProp("生产阶段名称"));
        properties.put("processCode", stringProp("工序编码"));
        properties.put("quantity", intProp("撤回数量"));
        return buildToolDef(
                "撤回扫码记录。支持preview预览撤回影响后再执行undo。"
                        + "工资已结算/下一环节已扫码/超时的记录无法撤回。",
                properties, List.of());
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        if (!aiAgentToolAccessService.hasManagerAccess()) {
            return errorJson("当前角色无权执行该操作");
        }
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (action == null || action.isBlank()) action = "preview";

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

        if ("preview".equals(action)) {
            return previewUndoImpact(recordId, scanCode, args);
        }

        Map<String, Object> params = buildUndoParams(recordId, scanCode, args);
        Map<String, Object> result = scanRecordOrchestrator.undo(params);
        return MAPPER.writeValueAsString(result);
    }

    private String previewUndoImpact(String recordId, String scanCode, Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        ScanRecord record = findRecord(recordId, scanCode, tenantId);
        if (record == null) {
            return errorJson("未找到对应的扫码记录");
        }

        Map<String, Object> preview = new LinkedHashMap<>();
        preview.put("success", true);
        preview.put("mode", "preview");
        preview.put("message", "以下是撤回影响预览，确认后请用 action=undo 执行撤回");

        Map<String, Object> recordInfo = new LinkedHashMap<>();
        recordInfo.put("recordId", record.getId());
        recordInfo.put("scanCode", record.getScanCode());
        recordInfo.put("orderNo", record.getOrderNo());
        recordInfo.put("processName", record.getProcessName());
        recordInfo.put("progressStage", record.getProgressStage());
        recordInfo.put("quantity", record.getQuantity());
        recordInfo.put("operatorName", record.getOperatorName());
        recordInfo.put("scanTime", record.getScanTime());
        recordInfo.put("scanType", record.getScanType());
        preview.put("recordInfo", recordInfo);

        List<String> impacts = new ArrayList<>();
        impacts.add("📋 该记录 " + record.getQuantity() + " 件将从 " + record.getProcessName() + " 工序进度中扣除");

        if (record.getProcessUnitPrice() != null && record.getProcessUnitPrice().doubleValue() > 0) {
            double cost = record.getQuantity() * record.getProcessUnitPrice().doubleValue();
            impacts.add(String.format("💰 工人 %s 的工资将减少 %.2f 元（%d件 × %.2f元/件）",
                    record.getOperatorName(), cost, record.getQuantity(), record.getProcessUnitPrice().doubleValue()));
        }

        String settlementStatus = record.getSettlementStatus();
        if ("SETTLED".equals(settlementStatus)) {
            impacts.add("🚫 该记录工资已结算，无法撤回！需先撤销工资结算");
        }

        long sameOrderCount = scanRecordService.lambdaQuery()
                .eq(ScanRecord::getOrderId, record.getOrderId())
                .ne(ScanRecord::getScanType, "orchestration")
                .eq(ScanRecord::getTenantId, tenantId)
                .gt(ScanRecord::getScanTime, record.getScanTime())
                .count();
        if (sameOrderCount > 0) {
            impacts.add("⚠️ 该记录之后还有 " + sameOrderCount + " 条扫码记录，撤回可能影响后续工序进度");
        }

        preview.put("impacts", impacts);
        preview.put("canUndo", !"SETTLED".equals(settlementStatus));
        preview.put("nextAction", "确认撤回请发送：action=undo, recordId=" + record.getId());

        return MAPPER.writeValueAsString(preview);
    }

    private ScanRecord findRecord(String recordId, String scanCode, Long tenantId) {
        if (recordId != null && !recordId.isBlank()) {
            return scanRecordService.lambdaQuery()
                    .eq(ScanRecord::getId, recordId)
                    .eq(ScanRecord::getTenantId, tenantId)
                    .one();
        }
        if (scanCode != null && !scanCode.isBlank()) {
            return scanRecordService.lambdaQuery()
                    .eq(ScanRecord::getScanCode, scanCode)
                    .eq(ScanRecord::getTenantId, tenantId)
                    .ne(ScanRecord::getScanType, "orchestration")
                    .orderByDesc(ScanRecord::getScanTime)
                    .last("LIMIT 1")
                    .one();
        }
        return null;
    }

    private Map<String, Object> buildUndoParams(String recordId, String scanCode, Map<String, Object> args) {
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
        return params;
    }
}
