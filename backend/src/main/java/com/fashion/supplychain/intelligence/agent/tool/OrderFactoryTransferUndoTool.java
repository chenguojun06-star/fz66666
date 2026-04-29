package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.orchestration.OrderFactoryTransferOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

@Slf4j
@Component
public class OrderFactoryTransferUndoTool extends AbstractAgentTool {

    @Autowired
    private OrderFactoryTransferOrchestrator transferOrchestrator;
    @Autowired
    private AiAgentToolAccessService aiAgentToolAccessService;
    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private ScanRecordService scanRecordService;

    @Override
    public String getName() {
        return "tool_order_factory_transfer_undo";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("action", stringProp("操作类型：preview(预览影响)/undo(执行撤回)，默认preview"));
        props.put("orderNo", stringProp("要撤回转厂的订单号，例如 PO2026001"));
        props.put("reason", stringProp("撤回原因，例如：转单有误、工厂沟通有误（可选）"));
        return buildToolDef(
                "撤回订单最近一次转厂操作。支持preview预览撤回影响后再执行undo。"
                        + "将整单转厂订单的绑定工厂恢复为转厂前的原工厂，"
                        + "并标记对应转厂日志为已撤回状态，自动通知原工厂与目标工厂相关人员。",
                props, List.of("orderNo"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        if (!aiAgentToolAccessService.hasManagerAccess()) {
            return errorJson("当前角色无权执行撤回转厂操作，需要跟单员或以上权限");
        }
        Map<String, Object> args = parseArgs(argumentsJson);
        String orderNo = requireString(args, "orderNo");
        String reason = optionalString(args, "reason");
        String action = optionalString(args, "action");
        if (action == null || action.isBlank()) action = "preview";

        if ("preview".equals(action)) {
            return previewUndoImpact(orderNo);
        }

        Map<String, Object> result = transferOrchestrator.undo(orderNo, reason);
        return MAPPER.writeValueAsString(result);
    }

    private String previewUndoImpact(String orderNo) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getOrderNo, orderNo)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .one();
        if (order == null) {
            return errorJson("未找到订单：" + orderNo);
        }

        List<Map<String, Object>> transferLogs = parseTransferLogJson(order.getTransferLogJson());
        Map<String, Object> activeLog = findLatestActiveLog(transferLogs);
        if (activeLog == null) {
            return errorJson("订单 " + orderNo + " 没有可撤回的转厂记录");
        }

        Map<String, Object> preview = new LinkedHashMap<>();
        preview.put("success", true);
        preview.put("mode", "preview");
        preview.put("message", "以下是撤回转厂影响预览，确认后请用 action=undo 执行撤回");

        Map<String, Object> orderInfo = new LinkedHashMap<>();
        orderInfo.put("orderNo", orderNo);
        orderInfo.put("styleNo", order.getStyleNo());
        orderInfo.put("styleName", order.getStyleName());
        orderInfo.put("currentFactory", order.getFactoryName());
        orderInfo.put("orderQuantity", order.getOrderQuantity());
        orderInfo.put("status", order.getStatus());
        preview.put("orderInfo", orderInfo);

        Map<String, Object> transferInfo = new LinkedHashMap<>();
        transferInfo.put("fromFactory", activeLog.get("oldFactoryName"));
        transferInfo.put("toFactory", activeLog.get("newFactoryName"));
        transferInfo.put("isFullTransfer", activeLog.get("isFullTransfer"));
        transferInfo.put("transferQuantity", activeLog.get("transferQuantity"));
        transferInfo.put("operator", activeLog.get("operator"));
        transferInfo.put("timestamp", activeLog.get("timestamp"));
        transferInfo.put("reason", activeLog.get("reason"));
        preview.put("transferInfo", transferInfo);

        List<String> impacts = new ArrayList<>();
        boolean isFull = Boolean.TRUE.equals(activeLog.get("isFullTransfer"));
        if (isFull) {
            impacts.add("📋 整单转厂撤回：订单绑定工厂将从「" + activeLog.get("newFactoryName") + "」恢复为「" + activeLog.get("oldFactoryName") + "」");
        } else {
            impacts.add("📋 部分转厂撤回：转厂日志标记为已撤回，订单绑定工厂不变");
        }

        long scanCountAfterTransfer = scanRecordService.lambdaQuery()
                .eq(ScanRecord::getOrderNo, orderNo)
                .eq(ScanRecord::getTenantId, tenantId)
                .ne(ScanRecord::getScanType, "orchestration")
                .count();
        if (scanCountAfterTransfer > 0) {
            impacts.add("⚠️ 该订单已有 " + scanCountAfterTransfer + " 条扫码记录，撤回转厂可能影响工厂维度的扫码统计和工资结算");
        }

        long undoneCount = transferLogs.stream()
                .filter(l -> "undone".equals(l.get("status")))
                .count();
        long totalTransfers = transferLogs.size();
        if (totalTransfers > 1) {
            impacts.add("📊 该订单共有 " + totalTransfers + " 次转厂记录（" + undoneCount + " 次已撤回），本次撤回的是最近一次");
        }

        if ("completed".equals(order.getStatus()) || "closed".equals(order.getStatus())) {
            impacts.add("🚫 订单状态为「" + order.getStatus() + "」，撤回转厂可能导致数据不一致，请谨慎操作");
        }

        preview.put("impacts", impacts);
        preview.put("canUndo", true);
        preview.put("nextAction", "确认撤回请发送：action=undo, orderNo=" + orderNo);

        return MAPPER.writeValueAsString(preview);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseTransferLogJson(String json) {
        if (json == null || json.isBlank()) return Collections.emptyList();
        try {
            return MAPPER.readValue(json, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception e) {
            log.warn("[OrderFactoryTransferUndoTool] 解析转厂日志失败: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    private Map<String, Object> findLatestActiveLog(List<Map<String, Object>> logs) {
        for (int i = logs.size() - 1; i >= 0; i--) {
            Map<String, Object> entry = logs.get(i);
            if ("active".equals(entry.get("status"))) {
                return entry;
            }
        }
        return null;
    }
}
