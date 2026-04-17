package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.FollowUpAction;
import com.fashion.supplychain.intelligence.dto.FollowUpAction.ActionField;
import com.fashion.supplychain.intelligence.dto.FollowUpAction.ActionType;
import com.fashion.supplychain.intelligence.dto.FollowUpAction.Option;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper.ToolExecRecord;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * 智能跟进建议引擎 — 根据工具执行结果 + 用户问题，生成上下文相关的可执行跟进动作。
 * <p>
 * 核心逻辑：分析 ToolExecRecord 的 toolName + rawResult + args，
 * 提取实体信息（订单号/款号/库存数量等），生成带预填参数的 FollowUpAction。
 */
@Slf4j
@Service
public class FollowUpSuggestionEngine {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_SUGGESTIONS = 4;

    /**
     * 根据工具执行记录和用户原始问题，生成跟进动作建议列表。
     */
    public List<FollowUpAction> generate(List<ToolExecRecord> toolRecords, String userQuestion) {
        List<FollowUpAction> actions = new ArrayList<>();
        if (toolRecords == null || toolRecords.isEmpty()) {
            return buildFallbackFromQuestion(userQuestion);
        }

        for (ToolExecRecord rec : toolRecords) {
            if (rec.rawResult == null || rec.rawResult.contains("\"error\"")) {
                continue;
            }
            List<FollowUpAction> derived = deriveFromTool(rec, userQuestion);
            actions.addAll(derived);
        }

        // 如果工具结果未产生任何建议，根据问题兜底
        if (actions.isEmpty()) {
            actions.addAll(buildFallbackFromQuestion(userQuestion));
        }

        // 去重 + 截断
        return deduplicate(actions).subList(0, Math.min(MAX_SUGGESTIONS, actions.size()));
    }

    // ────────────────────── 按工具名分发 ──────────────────────

    private List<FollowUpAction> deriveFromTool(ToolExecRecord rec, String question) {
        String tool = rec.toolName;
        if (tool == null) return List.of();

        return switch (tool) {
            case "tool_query_sample_stock",
                 "tool_query_stock" -> deriveFromInventory(rec);
            case "tool_query_order",
                 "tool_search_orders" -> deriveFromOrderQuery(rec);
            case "tool_query_style",
                 "tool_search_styles" -> deriveFromStyleQuery(rec);
            case "tool_quality_stats",
                 "tool_quality_report" -> deriveFromQuality(rec);
            case "tool_bom_cost_calc" -> deriveFromBomCost(rec);
            case "tool_quick_build_order" -> deriveFromQuickOrder(rec);
            case "tool_knowledge_search" -> deriveFromKnowledge(rec, question);
            case "tool_scan_undo" -> deriveFromScanUndo(rec);
            case "tool_cutting_task_create" -> deriveFromCuttingCreate(rec);
            case "tool_order_edit" -> deriveFromOrderEdit(rec);
            case "tool_payroll_approve" -> deriveFromPayroll(rec);
            default -> deriveGeneric(rec, question);
        };
    }

    // ────────────────────── 库存查询 → 出库/借调 ──────────────────────

    private List<FollowUpAction> deriveFromInventory(ToolExecRecord rec) {
        List<FollowUpAction> actions = new ArrayList<>();
        JsonNode result = parseJson(rec.rawResult);
        JsonNode args = parseJson(rec.args);

        String styleNo = extractString(args, "styleNo", "style_no", "keyword");
        String color = extractString(result, "color");
        int quantity = extractInt(result, "quantity", "stockQuantity", "availableQty");
        String location = extractString(result, "warehouseName", "location");

        // 构建库存摘要
        String summary = buildSummary("款号", styleNo, "颜色", color,
                "库存", quantity > 0 ? quantity + "件" : null,
                "仓库", location);

        if (quantity > 0) {
            actions.add(FollowUpAction.builder()
                    .label("出库 " + (styleNo != null ? styleNo : "该款") + (quantity > 0 ? " (" + quantity + "件)" : ""))
                    .icon("export")
                    .actionType(ActionType.EXECUTE)
                    .command("sample:checkout")
                    .dataSummary(summary)
                    .prefilledParams(buildMap("styleNo", styleNo, "color", color, "quantity", quantity))
                    .requiredInputs(List.of(
                            ActionField.builder().key("recipient").label("接收人/工厂").inputType("text").placeholder("输入接收人或工厂名").build()
                    ))
                    .build());

            actions.add(FollowUpAction.builder()
                    .label("借调给其他工厂")
                    .icon("swap")
                    .actionType(ActionType.EXECUTE)
                    .command("sample:borrow")
                    .dataSummary(summary)
                    .prefilledParams(buildMap("styleNo", styleNo, "color", color))
                    .requiredInputs(List.of(
                            ActionField.builder().key("targetFactory").label("目标工厂").inputType("text").placeholder("借调到哪个工厂").build(),
                            ActionField.builder().key("quantity").label("借调数量").inputType("number").placeholder("件数").defaultValue(1).build()
                    ))
                    .build());
        }

        if (styleNo != null) {
            actions.add(FollowUpAction.builder()
                    .label("查看 " + styleNo + " 全部颜色库存")
                    .icon("search")
                    .actionType(ActionType.ASK)
                    .command(styleNo + " 所有颜色的库存明细")
                    .dataSummary(summary)
                    .build());
        }

        return actions;
    }

    // ────────────────────── 订单查询 → 编辑/催单/暂停 ──────────────────────

    private List<FollowUpAction> deriveFromOrderQuery(ToolExecRecord rec) {
        List<FollowUpAction> actions = new ArrayList<>();
        JsonNode result = parseJson(rec.rawResult);
        JsonNode args = parseJson(rec.args);

        String orderId = extractString(result, "id", "orderId");
        String orderNo = extractString(result, "orderNo", "order_no");
        if (orderNo == null) orderNo = extractString(args, "orderNo", "order_no", "keyword");
        String factoryName = extractString(result, "factoryName");
        String styleNo = extractString(result, "styleNo", "style_no");
        int orderQty = extractInt(result, "orderQuantity", "totalQuantity", "quantity");
        String shipDate = extractString(result, "expectedShipDate", "plannedEndDate");
        String status = extractString(result, "status", "statusLabel");
        int progress = extractInt(result, "productionProgress");

        // 构建订单摘要
        String summary = buildSummary("订单", orderNo, "款号", styleNo,
                "数量", orderQty > 0 ? orderQty + "件" : null,
                "工厂", factoryName, "交期", shipDate,
                "进度", progress > 0 ? progress + "%" : null,
                "状态", status);

        if (orderNo != null) {
            actions.add(FollowUpAction.builder()
                    .label("修改 " + orderNo + " 交期")
                    .icon("edit")
                    .actionType(ActionType.EXECUTE)
                    .command("order:ship_date")
                    .dataSummary(summary)
                    .prefilledParams(buildMap("orderId", orderId, "orderNo", orderNo))
                    .requiredInputs(List.of(
                            ActionField.builder().key("expectedShipDate").label("新交期").inputType("date").placeholder("选择交货日期").build()
                    ))
                    .build());

            if (factoryName != null) {
                actions.add(FollowUpAction.builder()
                        .label("催单 " + factoryName)
                        .icon("notification")
                        .actionType(ActionType.EXECUTE)
                        .command("factory:urge")
                        .dataSummary(summary)
                        .prefilledParams(buildMap("orderId", orderId, "orderNo", orderNo, "factoryName", factoryName))
                        .requiredInputs(List.of(
                                ActionField.builder().key("remark").label("催单备注").inputType("text").placeholder("可选备注").build()
                        ))
                        .build());
            }

            actions.add(FollowUpAction.builder()
                    .label("查看订单详情")
                    .icon("eye")
                    .actionType(ActionType.NAVIGATE)
                    .command("/production/progress")
                    .dataSummary(summary)
                    .prefilledParams(buildMap("orderNo", orderNo))
                    .build());
        }

        return actions;
    }

    // ────────────────────── 款式查询 → 建单/查BOM ──────────────────────

    private List<FollowUpAction> deriveFromStyleQuery(ToolExecRecord rec) {
        List<FollowUpAction> actions = new ArrayList<>();
        JsonNode result = parseJson(rec.rawResult);
        JsonNode args = parseJson(rec.args);

        String styleNo = extractString(args, "styleNo", "style_no", "keyword");
        if (styleNo == null) styleNo = extractString(result, "styleNo", "style_no");
        String styleName = extractString(result, "styleName", "name");
        String category = extractString(result, "category", "categoryName");
        String designer = extractString(result, "designer", "designerName");

        String summary = buildSummary("款号", styleNo, "款名", styleName,
                "类别", category, "设计师", designer);

        if (styleNo != null) {
            actions.add(FollowUpAction.builder()
                    .label("用 " + styleNo + " 快速建单")
                    .icon("plus")
                    .actionType(ActionType.ASK)
                    .command("帮我用款号 " + styleNo + " 建一个生产订单")
                    .dataSummary(summary)
                    .build());

            actions.add(FollowUpAction.builder()
                    .label("计算 " + styleNo + " BOM成本")
                    .icon("calculator")
                    .actionType(ActionType.ASK)
                    .command("计算 " + styleNo + " 的BOM成本")
                    .dataSummary(summary)
                    .build());
        }

        return actions;
    }

    // ────────────────────── 质检数据 → 处理不良品 ──────────────────────

    private List<FollowUpAction> deriveFromQuality(ToolExecRecord rec) {
        List<FollowUpAction> actions = new ArrayList<>();
        JsonNode result = parseJson(rec.rawResult);

        String orderNo = extractString(result, "orderNo", "order_no");
        int defectCount = extractInt(result, "defectCount", "unqualifiedQuantity");
        int totalQty = extractInt(result, "totalQuantity", "inspectedQuantity");
        String defectCategory = extractString(result, "defectCategory", "mainDefect");

        String summary = buildSummary("订单", orderNo,
                "不良品", defectCount > 0 ? defectCount + "件" : null,
                "已检", totalQty > 0 ? totalQty + "件" : null,
                "主要缺陷", defectCategory);

        if (defectCount > 0 && orderNo != null) {
            actions.add(FollowUpAction.builder()
                    .label("处理 " + orderNo + " 不良品 (" + defectCount + "件)")
                    .icon("warning")
                    .actionType(ActionType.EXECUTE)
                    .command("defective:handle")
                    .dataSummary(summary)
                    .prefilledParams(buildMap("orderNo", orderNo, "defectCount", defectCount))
                    .requiredInputs(List.of(
                            ActionField.builder().key("action").label("处理方式").inputType("select")
                                    .options(List.of(
                                            Option.builder().label("返修").value("repair").build(),
                                            Option.builder().label("报废").value("scrap").build(),
                                            Option.builder().label("降级出货").value("downgrade").build()
                                    )).build()
                    ))
                    .build());
        }

        return actions;
    }

    // ────────────────────── BOM 成本计算后 ──────────────────────

    private List<FollowUpAction> deriveFromBomCost(ToolExecRecord rec) {
        JsonNode result = parseJson(rec.rawResult);
        JsonNode args = parseJson(rec.args);
        String styleNo = extractString(args, "styleNo", "keyword");
        if (styleNo == null) return List.of();

        String totalCost = extractString(result, "totalCost", "total");
        String materialCost = extractString(result, "materialCost");
        String processCost = extractString(result, "processCost");

        String summary = buildSummary("款号", styleNo,
                "总成本", totalCost, "物料", materialCost, "工序", processCost);

        return List.of(FollowUpAction.builder()
                .label("用 " + styleNo + " 建单")
                .icon("plus")
                .actionType(ActionType.ASK)
                .command("帮我用 " + styleNo + " 建一个生产订单")
                .dataSummary(summary)
                .build());
    }

    // ────────────────────── 快速建单后 → 查看/裁剪 ──────────────────────

    private List<FollowUpAction> deriveFromQuickOrder(ToolExecRecord rec) {
        List<FollowUpAction> actions = new ArrayList<>();
        JsonNode result = parseJson(rec.rawResult);

        String orderNo = extractString(result, "orderNo", "order_no");
        String styleNo = extractString(result, "styleNo", "style_no");
        int totalQty = extractInt(result, "totalQuantity", "orderQuantity", "quantity");
        String factoryName = extractString(result, "factoryName");

        String summary = buildSummary("订单", orderNo, "款号", styleNo,
                "数量", totalQty > 0 ? totalQty + "件" : null,
                "工厂", factoryName);

        if (orderNo != null) {
            actions.add(FollowUpAction.builder()
                    .label("查看 " + orderNo + " 详情")
                    .icon("eye")
                    .actionType(ActionType.NAVIGATE)
                    .command("/production/progress")
                    .dataSummary(summary)
                    .prefilledParams(buildMap("orderNo", orderNo))
                    .build());

            actions.add(FollowUpAction.builder()
                    .label("为 " + orderNo + " 创建裁剪单")
                    .icon("scissor")
                    .actionType(ActionType.ASK)
                    .command("帮我为订单 " + orderNo + " 创建裁剪单")
                    .dataSummary(summary)
                    .build());
        }

        return actions;
    }

    // ────────────────────── 知识库查询 → 深入追问 ──────────────────────

    private List<FollowUpAction> deriveFromKnowledge(ToolExecRecord rec, String question) {
        return List.of(FollowUpAction.builder()
                .label("继续深入了解")
                .icon("book")
                .actionType(ActionType.ASK)
                .command("关于「" + truncate(question, 20) + "」，能再详细解释一下吗？")
                .build());
    }

    // ────────────────────── 撤回扫码后 ──────────────────────

    private List<FollowUpAction> deriveFromScanUndo(ToolExecRecord rec) {
        return List.of(FollowUpAction.builder()
                .label("查看该订单最新扫码记录")
                .icon("history")
                .actionType(ActionType.ASK)
                .command("查看这个订单最近的扫码记录")
                .build());
    }

    // ────────────────────── 创建裁剪单后 ──────────────────────

    private List<FollowUpAction> deriveFromCuttingCreate(ToolExecRecord rec) {
        JsonNode result = parseJson(rec.rawResult);
        String orderNo = extractString(result, "orderNo", "order_no");
        String styleNo = extractString(result, "styleNo", "style_no");
        int totalQty = extractInt(result, "totalQuantity", "orderQuantity");

        String summary = buildSummary("订单", orderNo, "款号", styleNo,
                "数量", totalQty > 0 ? totalQty + "件" : null);

        return List.of(FollowUpAction.builder()
                .label("查看裁剪进度")
                .icon("eye")
                .actionType(ActionType.NAVIGATE)
                .command("/production/cutting")
                .dataSummary(summary)
                .prefilledParams(orderNo != null ? buildMap("orderNo", orderNo) : Map.of())
                .build());
    }

    // ────────────────────── 订单编辑后 ──────────────────────

    private List<FollowUpAction> deriveFromOrderEdit(ToolExecRecord rec) {
        return List.of(FollowUpAction.builder()
                .label("查看修改后的订单")
                .icon("eye")
                .actionType(ActionType.ASK)
                .command("帮我查一下刚才编辑的订单现在什么状态")
                .build());
    }

    // ────────────────────── 工资审批后 ──────────────────────

    private List<FollowUpAction> deriveFromPayroll(ToolExecRecord rec) {
        return List.of(FollowUpAction.builder()
                .label("查看剩余待审批结算")
                .icon("audit")
                .actionType(ActionType.ASK)
                .command("还有哪些待审批的工资结算单")
                .build());
    }

    // ────────────────────── 通用兜底 ──────────────────────

    private List<FollowUpAction> deriveGeneric(ToolExecRecord rec, String question) {
        // 从工具参数中尽可能提取实体 ID
        JsonNode args = parseJson(rec.args);
        String orderNo = extractString(args, "orderNo", "order_no");
        if (orderNo != null) {
            return List.of(FollowUpAction.builder()
                    .label("查看 " + orderNo + " 进度")
                    .icon("eye")
                    .actionType(ActionType.NAVIGATE)
                    .command("/production/progress")
                    .prefilledParams(buildMap("orderNo", orderNo))
                    .build());
        }
        return List.of();
    }

    // ────────────────────── 问题兜底（无工具执行时） ──────────────────────

    private List<FollowUpAction> buildFallbackFromQuestion(String question) {
        if (question == null) return List.of();
        List<FollowUpAction> actions = new ArrayList<>();

        if (question.contains("订单") || question.contains("生产")) {
            actions.add(FollowUpAction.builder().label("查看逾期订单").icon("warning").actionType(ActionType.ASK).command("有哪些逾期订单").build());
            actions.add(FollowUpAction.builder().label("今日生产汇总").icon("bar-chart").actionType(ActionType.ASK).command("今天的生产情况怎么样").build());
        } else if (question.contains("库存") || question.contains("仓库") || question.contains("样衣")) {
            actions.add(FollowUpAction.builder().label("查看低库存预警").icon("warning").actionType(ActionType.ASK).command("有哪些面料库存不足").build());
        } else if (question.contains("工资") || question.contains("结算")) {
            actions.add(FollowUpAction.builder().label("本月工资汇总").icon("dollar").actionType(ActionType.ASK).command("本月工资结算汇总情况").build());
        }

        return actions;
    }

    // ────────────────────── 工具方法 ──────────────────────

    private JsonNode parseJson(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return JSON.readTree(json);
        } catch (Exception e) {
            return null;
        }
    }

    private String extractString(JsonNode node, String... keys) {
        if (node == null) return null;
        for (String key : keys) {
            JsonNode val = node.get(key);
            if (val != null && !val.isNull() && val.isTextual()) {
                String text = val.asText();
                if (!text.isBlank()) return text;
            }
        }
        return null;
    }

    private int extractInt(JsonNode node, String... keys) {
        if (node == null) return 0;
        for (String key : keys) {
            JsonNode val = node.get(key);
            if (val != null && val.isNumber()) return val.asInt();
        }
        return 0;
    }

    private Map<String, Object> buildMap(Object... keyValues) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length - 1; i += 2) {
            if (keyValues[i + 1] != null) {
                map.put(String.valueOf(keyValues[i]), keyValues[i + 1]);
            }
        }
        return map;
    }

    private List<FollowUpAction> deduplicate(List<FollowUpAction> actions) {
        Set<String> seen = new HashSet<>();
        List<FollowUpAction> unique = new ArrayList<>();
        for (FollowUpAction a : actions) {
            String key = a.getLabel() + "|" + a.getCommand();
            if (seen.add(key)) unique.add(a);
        }
        return unique;
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return "";
        return text.length() <= maxLen ? text : text.substring(0, maxLen) + "…";
    }

    /**
     * 构建 "key1: val1 · key2: val2" 格式的数据摘要，跳过 null/空值。
     */
    private String buildSummary(String... keyValues) {
        StringJoiner joiner = new StringJoiner(" · ");
        for (int i = 0; i < keyValues.length - 1; i += 2) {
            String key = keyValues[i];
            String val = keyValues[i + 1];
            if (val != null && !val.isBlank()) {
                joiner.add(key + ": " + val);
            }
        }
        String result = joiner.toString();
        return result.isEmpty() ? null : result;
    }
}
