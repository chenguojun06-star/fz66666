package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.helper.StepWizardBuilder;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

@Slf4j
@Component
public class OrderBatchCloseTool extends AbstractAgentTool {

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;
    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private AiAgentToolAccessService aiAgentToolAccessService;

    private static final String PO_PREFIX = "PO";

    @Override
    public String getName() {
        return "tool_order_batch_close";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("orderIds", stringProp("要关闭的订单ID列表，多个ID用逗号分隔（如：id1,id2,id3）"));
        properties.put("orderNos", stringProp("要关闭的订单号列表，多个订单号用逗号分隔（如：PO20260409001,PO20260409002）。orderIds和orderNos至少提供一个"));
        properties.put("remark", stringProp("关单备注/原因"));
        properties.put("specialClose", stringProp("是否特需关单（true/false），当裁剪数量不足时需要特需关单并填写原因"));

        return buildToolDef(
                "批量关闭生产订单。当用户说'关闭订单'、'关单'、'批量关单'时调用。"
                        + "支持按订单ID或订单号批量关闭，正常关单需满足裁剪数>=90%条件，不满足时需特需关单。",
                properties, List.of());
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        if (!aiAgentToolAccessService.hasManagerAccess()) {
            return errorJson("当前角色无权执行关单操作，需要管理员权限");
        }
        Map<String, Object> args = parseArgs(argumentsJson);

        List<String> orderIds = resolveOrderIds(args);
        if (orderIds.isEmpty()) {
            Map<String, Object> wizard = StepWizardBuilder.build("order_batch_close", "批量关单", "选择要关闭的订单", "📋", "确认关单", "批量关单",
                StepWizardBuilder.steps(
                    StepWizardBuilder.step("orders", "选择订单", "输入要关闭的订单号，多个用逗号分隔",
                        StepWizardBuilder.textField("orderNos", "订单号", true, "如 PO001,PO002,PO003"),
                        StepWizardBuilder.selectField("specialClose", "关单类型", false,
                            StepWizardBuilder.opt("普通关单","false"), StepWizardBuilder.opt("特需关单","true")),
                        StepWizardBuilder.textField("remark", "关单原因", false, "特需关单时必填"))
                ));
            try { return MAPPER.writeValueAsString(StepWizardBuilder.wrapResult("请提供要关闭的订单号", true, List.of("orderIds"), "请补充要关闭的订单信息", wizard)); } catch (Exception e) { return errorJson("请提供要关闭的订单ID或订单号"); }
        }

        String remark = optionalString(args, "remark");
        boolean specialClose = "true".equalsIgnoreCase(optionalString(args, "specialClose"));

        if (specialClose && (remark == null || remark.isBlank())) {
            return errorJson("特需关单必须填写关单原因");
        }

        List<Map<String, Object>> results = productionOrderOrchestrator.batchCloseOrders(
                orderIds, "ai_agent", remark, specialClose);

        long successCount = results.stream().filter(r -> Boolean.TRUE.equals(r.get("success"))).count();
        long failCount = results.size() - successCount;

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("total", orderIds.size());
        summary.put("success", successCount);
        summary.put("failed", failCount);
        summary.put("results", results);

        String message = String.format("批量关单完成：共%d单，成功%d单，失败%d单",
                orderIds.size(), successCount, failCount);

        return successJson(message, summary);
    }

    private List<String> resolveOrderIds(Map<String, Object> args) {
        List<String> ids = new ArrayList<>();
        String orderIdsStr = optionalString(args, "orderIds");
        if (orderIdsStr != null) {
            for (String id : orderIdsStr.split("[,，]")) {
                String trimmed = id.trim();
                if (!trimmed.isEmpty()) ids.add(trimmed);
            }
        }
        String orderNosStr = optionalString(args, "orderNos");
        if (orderNosStr != null) {
            for (String no : orderNosStr.split("[,，]")) {
                String trimmed = no.trim();
                if (!trimmed.isEmpty()) {
                    if (trimmed.toUpperCase().startsWith(PO_PREFIX)) {
                        try {
                            ProductionOrder order = productionOrderService.getByOrderNo(trimmed);
                            if (order != null) {
                                ids.add(order.getId());
                            } else {
                                log.warn("[tool_order_batch_close] 订单号未找到: {}", trimmed);
                                ids.add(trimmed);
                            }
                        } catch (Exception e) {
                            log.warn("[tool_order_batch_close] 订单号解析失败: {}", trimmed, e);
                            ids.add(trimmed);
                        }
                    } else {
                        ids.add(trimmed);
                    }
                }
            }
        }
        return ids;
    }
}
