package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.orchestration.ShipmentReconciliationOrchestrator;
import com.fashion.supplychain.intelligence.agent.AiTool;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 出货对账 AI 工具
 *
 * <p>actions:
 * <ul>
 *   <li>list — 查询出货对账列表（支持客户、订单、状态筛选）</li>
 *   <li>detail — 查询单条对账详情（含利润信息）</li>
 *   <li>profit_stats — 查询指定订单的利润概况</li>
 * </ul>
 */
@Slf4j
@Component
public class ShipmentReconciliationTool extends AbstractAgentTool {

    @Autowired
    private ShipmentReconciliationOrchestrator reconciliationOrchestrator;

    @Override
    public String getName() {
        return "tool_shipment_reconciliation";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("action", stringProp("操作类型：list/detail/profit_stats"));
        props.put("reconciliation_id", stringProp("对账单ID（detail/profit_stats时必填）"));
        props.put("order_id", stringProp("订单ID，profit_stats时用于精准扫码成本计算"));
        props.put("status", stringProp("状态筛选：draft/verified/approved/paid"));
        props.put("customer_name", stringProp("客户名称（模糊筛选）"));
        props.put("style_no", stringProp("款式编号（模糊筛选）"));
        props.put("page", intProp("页码，默认1"));
        props.put("page_size", intProp("每页数量，默认10"));
        return buildToolDef("出货对账管理：查询对账单列表、查看详情与利润统计", props,
                List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = requireString(args, "action");
        return switch (action) {
            case "list" -> listReconciliations(args);
            case "detail" -> getDetail(args);
            case "profit_stats" -> getProfitStats(args);
            default -> errorJson("不支持的action: " + action + "，可选: list/detail/profit_stats");
        };
    }

    private String listReconciliations(Map<String, Object> args) {
        try {
            Map<String, Object> params = new LinkedHashMap<>();
            String status = optionalString(args, "status");
            String customerName = optionalString(args, "customer_name");
            String styleNo = optionalString(args, "style_no");
            if (status != null) params.put("status", status);
            if (customerName != null) params.put("customerName", customerName);
            if (styleNo != null) params.put("styleNo", styleNo);
            params.put("page", optionalInt(args, "page") != null ? optionalInt(args, "page") : 1);
            params.put("pageSize", optionalInt(args, "page_size") != null ? optionalInt(args, "page_size") : 10);

            var page = reconciliationOrchestrator.list(params);
            long total = page.getTotal();
            List<Map<String, Object>> rows = new ArrayList<>();
            for (ShipmentReconciliation r : page.getRecords()) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", r.getId());
                row.put("reconciliationNo", r.getReconciliationNo());
                row.put("customerName", r.getCustomerName());
                row.put("styleNo", r.getStyleNo());
                row.put("orderNo", r.getOrderNo());
                row.put("quantity", r.getQuantity());
                row.put("unitPrice", r.getUnitPrice());
                row.put("finalAmount", r.getFinalAmount());
                row.put("profitMargin", r.getProfitMargin());
                row.put("status", r.getStatus());
                row.put("reconciliationDate", r.getReconciliationDate());
                rows.add(row);
            }
            return successJson("出货对账列表查询成功（共" + total + "条）",
                    Map.of("total", total, "list", rows));
        } catch (Exception e) {
            log.error("[ShipmentReconciliationTool.list] 异常: {}", e.getMessage(), e);
            return errorJson("查询出货对账列表失败: " + e.getMessage());
        }
    }

    private String getDetail(Map<String, Object> args) {
        try {
            String id = requireString(args, "reconciliation_id");
            ShipmentReconciliation r = reconciliationOrchestrator.getById(id);
            if (r == null) return errorJson("找不到对账单: " + id);

            reconciliationOrchestrator.fillProfitInfo(r);
            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("id", r.getId());
            detail.put("reconciliationNo", r.getReconciliationNo());
            detail.put("customerName", r.getCustomerName());
            detail.put("styleNo", r.getStyleNo());
            detail.put("orderNo", r.getOrderNo());
            detail.put("quantity", r.getQuantity());
            detail.put("unitPrice", r.getUnitPrice());
            detail.put("totalAmount", r.getTotalAmount());
            detail.put("deductionAmount", r.getDeductionAmount());
            detail.put("finalAmount", r.getFinalAmount());
            detail.put("scanCost", r.getScanCost());
            detail.put("materialCost", r.getMaterialCost());
            detail.put("totalCost", r.getTotalCost());
            detail.put("profitAmount", r.getProfitAmount());
            detail.put("profitMargin", r.getProfitMargin());
            detail.put("isOwnFactory", r.getIsOwnFactory());
            detail.put("status", r.getStatus());
            detail.put("remark", r.getRemark());

            // 扣款明细
            try {
                var items = reconciliationOrchestrator.getDeductionItems(String.valueOf(r.getId()));
                detail.put("deductionItems", items);
            } catch (Exception ex) {
                detail.put("deductionItems", List.of());
            }
            return successJson("对账单详情查询成功", detail);
        } catch (Exception e) {
            log.error("[ShipmentReconciliationTool.detail] 异常: {}", e.getMessage(), e);
            return errorJson("查询对账详情失败: " + e.getMessage());
        }
    }

    private String getProfitStats(Map<String, Object> args) {
        try {
            String reconciliationId = optionalString(args, "reconciliation_id");
            String orderId = optionalString(args, "order_id");
            Map<String, Object> stats = new LinkedHashMap<>();

            if (orderId != null) {
                var scanCost = reconciliationOrchestrator.calculateScanCost(orderId);
                stats.put("orderId", orderId);
                stats.put("scanCost", scanCost);
                stats.put("message", "扫码成本计算成功");
            }
            if (reconciliationId != null) {
                ShipmentReconciliation r = reconciliationOrchestrator.getById(reconciliationId);
                if (r != null) {
                    reconciliationOrchestrator.fillProfitInfo(r);
                    stats.put("profitAmount", r.getProfitAmount());
                    stats.put("profitMargin", r.getProfitMargin());
                    stats.put("finalAmount", r.getFinalAmount());
                    stats.put("totalCost", r.getTotalCost());
                }
            }
            if (stats.isEmpty()) return errorJson("请提供 reconciliation_id 或 order_id");
            return successJson("利润统计获取成功", stats);
        } catch (Exception e) {
            log.error("[ShipmentReconciliationTool.profit_stats] 异常: {}", e.getMessage(), e);
            return errorJson("利润统计失败: " + e.getMessage());
        }
    }
}
