package com.fashion.supplychain.intelligence.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Slf4j
@Service
@Lazy
public class ContextEngineeringService {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Value("${xiaoyun.context.max-tool-result-chars:6000}")
    private int maxToolResultChars;

    @Value("${xiaoyun.context.max-messages:30}")
    private int maxMessages;

    @Value("${xiaoyun.context.summarize-when-over:20}")
    private int summarizeWhenOver;

    private static final Pattern ORDER_NO_PATTERN = Pattern.compile("(ORD\\d+|PO\\d{14}|[A-Z]{2,4}\\d{8,})");
    private static final Pattern NUMBER_PATTERN = Pattern.compile("\\b\\d+(?:\\.\\d+)?%?\\b");
    private static final Pattern STATUS_PATTERN = Pattern.compile("(已完成|进行中|未开始|已逾期|已入库|待审批|已关闭|已报废|已取消)");
    private static final Pattern DATE_PATTERN = Pattern.compile("\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}");

    public int getMaxToolResultChars() {
        return maxToolResultChars;
    }

    public String summarizeToolResult(String toolName, String rawResult, String originalInput) {
        if (rawResult == null || rawResult.isBlank()) {
            return "工具 " + toolName + " 未返回数据";
        }

        if (rawResult.length() <= maxToolResultChars) {
            return rawResult;
        }

        // D-320: 优先按"记录保留"做结构化摘要（订单号|款号|进度|数量|交期一行一条），
        // 避免明细数组被"前300字符"砍头后模型只看到汇总数、答不出具体单号进度。
        try {
            JsonNode root = JSON.readTree(rawResult);
            return summarizeStructured(toolName, root, rawResult.length());
        } catch (Exception e) {
            log.debug("[ContextEngineering] 非JSON工具结果，退回正则摘要: tool={}", toolName);
        }
        return summarizeByRegex(toolName, rawResult);
    }

    /** 单数组最多保留的记录条数 */
    private static final int SUMMARY_MAX_RECORDS_PER_ARRAY = 20;
    /** 摘要总行数预算，超出即截断 */
    private static final int SUMMARY_MAX_LINES = 80;

    private String summarizeStructured(String toolName, JsonNode root, int rawLen) {
        StringBuilder sb = new StringBuilder();
        sb.append("【").append(toolName).append(" 查询结果】原文").append(rawLen)
                .append("字符，以下为保留记录明细的结构化摘要：\n");
        int[] lineBudget = {SUMMARY_MAX_LINES};
        appendNodeSummary(sb, root, 0, lineBudget);
        return sb.toString();
    }

    private void appendNodeSummary(StringBuilder sb, JsonNode node, int depth, int[] lineBudget) {
        if (lineBudget[0] <= 0) {
            sb.append("…其余内容省略\n");
            return;
        }
        if (node.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
            while (fields.hasNext() && lineBudget[0] > 0) {
                Map.Entry<String, JsonNode> entry = fields.next();
                JsonNode value = entry.getValue();
                if (value.isValueNode()) {
                    String text = scalarText(value);
                    if (!text.isEmpty()) {
                        sb.append(fieldLabel(entry.getKey())).append(": ").append(text).append("\n");
                        lineBudget[0]--;
                    }
                } else if (value.isArray() && value.size() > 0) {
                    appendArraySummary(sb, entry.getKey(), value, lineBudget);
                } else if (value.isObject() && depth < 2) {
                    sb.append("\n■ ").append(fieldLabel(entry.getKey())).append("\n");
                    appendNodeSummary(sb, value, depth + 1, lineBudget);
                } else if (value.isObject()) {
                    sb.append(fieldLabel(entry.getKey())).append(": (对象，").append(value.size()).append("个字段)\n");
                    lineBudget[0]--;
                }
            }
        } else if (node.isArray()) {
            appendArraySummary(sb, "明细", node, lineBudget);
        }
    }

    private void appendArraySummary(StringBuilder sb, String name, JsonNode arr, int[] lineBudget) {
        sb.append("\n【").append(fieldLabel(name)).append("】共").append(arr.size()).append("条\n");
        int limit = Math.min(arr.size(), SUMMARY_MAX_RECORDS_PER_ARRAY);
        for (int i = 0; i < limit && lineBudget[0] > 0; i++) {
            JsonNode item = arr.get(i);
            if (item.isObject()) {
                sb.append("- ").append(recordLine(item)).append("\n");
            } else if (item.isValueNode()) {
                sb.append("- ").append(scalarText(item)).append("\n");
            } else if (!item.isNull()) {
                sb.append("- (复杂对象)\n");
            }
            lineBudget[0]--;
        }
        if (arr.size() > limit) {
            sb.append("…其余").append(arr.size() - limit).append("条省略\n");
        }
    }

    /** 记录字段展示优先序：订单身份字段在前，金额/杂项在后 */
    private static final List<String> RECORD_FIELD_ORDER = List.of(
            "orderNo", "styleNo", "styleName", "factoryName", "currentStage", "stage", "status",
            "progress", "overdueDays", "orderQuantity", "completedQuantity", "quantity",
            "deadline", "plannedEndDate", "expectedShipDate", "name", "title");

    private static final Map<String, String> FIELD_LABELS = Map.ofEntries(
            Map.entry("orderNo", "单号"), Map.entry("styleNo", "款号"), Map.entry("styleName", "款名"),
            Map.entry("factoryName", "工厂"), Map.entry("factory", "工厂"), Map.entry("status", "状态"),
            Map.entry("progress", "进度"), Map.entry("orderQuantity", "下单数"),
            Map.entry("completedQuantity", "完成数"), Map.entry("quantity", "数量"),
            Map.entry("overdueDays", "逾期天"), Map.entry("deadline", "交期"),
            Map.entry("plannedEndDate", "交期"), Map.entry("expectedShipDate", "发货日"),
            Map.entry("currentStage", "环节"), Map.entry("stage", "环节"),
            Map.entry("name", "名称"), Map.entry("title", "标题"), Map.entry("count", "条数"));

    /** 把一条记录压成 "单号 xx | 款号 yy | 进度 0% | 交期 …" 一行，保住字段与值的对应关系 */
    private String recordLine(JsonNode item) {
        LinkedHashMap<String, String> parts = new LinkedHashMap<>();
        for (String key : RECORD_FIELD_ORDER) {
            JsonNode v = item.get(key);
            if (v != null && v.isValueNode() && !v.isNull()) {
                String text = formatField(key, v);
                if (!text.isEmpty()) parts.put(key, text);
            }
        }
        int extras = 0;
        Iterator<Map.Entry<String, JsonNode>> fields = item.fields();
        while (fields.hasNext() && extras < 6) {
            Map.Entry<String, JsonNode> entry = fields.next();
            if (parts.containsKey(entry.getKey())) continue;
            JsonNode v = entry.getValue();
            if (v != null && v.isValueNode() && !v.isNull()) {
                String text = scalarText(v);
                if (!text.isEmpty() && text.length() <= 30) {
                    parts.put(entry.getKey(), fieldLabel(entry.getKey()) + " " + text);
                    extras++;
                }
            }
        }
        return String.join(" | ", parts.values());
    }

    private String formatField(String key, JsonNode value) {
        String label = FIELD_LABELS.getOrDefault(key, key);
        String text = scalarText(value);
        if (text.isEmpty()) return "";
        return switch (key) {
            case "progress" -> label + " " + text + "%";
            case "overdueDays" -> label + " " + text + "天";
            default -> label + " " + text;
        };
    }

    private String scalarText(JsonNode value) {
        String text = value.isTextual() ? value.asText() : value.asText();
        return truncate(text.trim(), 60);
    }

    private String fieldLabel(String key) {
        return FIELD_LABELS.getOrDefault(key, key);
    }

    private static String truncate(String text, int maxLength) {
        if (text == null) return "";
        return text.length() <= maxLength ? text : text.substring(0, Math.max(0, maxLength - 1)) + "…";
    }

    /** 非JSON结果的兜底摘要：正则抽取订单号/状态/日期/数字 */
    private String summarizeByRegex(String toolName, String rawResult) {
        StringBuilder summary = new StringBuilder();
        summary.append("【").append(toolName).append(" 查询结果摘要】\n");

        List<String> orderNos = extractAll(ORDER_NO_PATTERN, rawResult, 5);
        if (!orderNos.isEmpty()) {
            summary.append("涉及订单: ").append(String.join(", ", orderNos)).append("\n");
        }

        List<String> statuses = extractAll(STATUS_PATTERN, rawResult, 5);
        if (!statuses.isEmpty()) {
            summary.append("状态: ").append(String.join(", ", statuses)).append("\n");
        }

        List<String> dates = extractAll(DATE_PATTERN, rawResult, 5);
        if (!dates.isEmpty()) {
            summary.append("日期: ").append(String.join(", ", dates)).append("\n");
        }

        List<String> keyNumbers = extractKeyNumbers(rawResult, 8);
        if (!keyNumbers.isEmpty()) {
            summary.append("关键数字: ").append(String.join(", ", keyNumbers)).append("\n");
        }

        String firstLines = rawResult.length() > 300 ? rawResult.substring(0, 300) : rawResult;
        summary.append("前300字符: ").append(firstLines).append("...\n");

        summary.append("(完整结果共 ").append(rawResult.length()).append(" 字符，已智能摘要)");

        return summary.toString();
    }

    public String smartCompress(String toolResult, String queryContext) {
        if (toolResult == null || toolResult.length() <= maxToolResultChars * 2) {
            return toolResult;
        }

        if (queryContext != null && !queryContext.isBlank()) {
            String[] keywords = queryContext.split("[\\s，,。.！!？?]+");
            StringBuilder filtered = new StringBuilder();

            String[] lines = toolResult.split("\n");
            for (String line : lines) {
                boolean matchesQuery = false;
                for (String kw : keywords) {
                    if (kw.length() >= 2 && line.contains(kw)) {
                        matchesQuery = true;
                        break;
                    }
                }
                if (matchesQuery || line.contains("ORD") || line.contains("状态") || line.contains("进度")) {
                    filtered.append(line).append("\n");
                }
            }

            if (filtered.length() > 0) {
                return filtered.toString().trim();
            }
        }

        return toolResult.length() > maxToolResultChars * 2
                ? toolResult.substring(0, maxToolResultChars * 2) + "\n...(结果已截断，共" + toolResult.length() + "字符)"
                : toolResult;
    }

    public List<AiMessage> compressConversationHistory(List<AiMessage> messages) {
        if (messages == null || messages.size() <= maxMessages) {
            return messages;
        }

        int systemCount = 0;
        int excessCount = messages.size() - maxMessages;
        List<AiMessage> compressed = new ArrayList<>();

        for (AiMessage msg : messages) {
            if ("system".equals(msg.getRole())) {
                compressed.add(msg);
                systemCount++;
            } else if ("tool".equals(msg.getRole())) {
                if (compressed.size() > systemCount + 3) {
                    StringBuilder content = new StringBuilder();
                    if (msg.getContent() != null) {
                        content.append(summarizeToolResult(
                                msg.getName() != null ? msg.getName() : "unknown",
                                msg.getContent(), null));
                    }
                    AiMessage summarized = AiMessage.tool(
                            content.toString(),
                            msg.getTool_call_id(),
                            msg.getName());
                    compressed.add(summarized);
                } else {
                    compressed.add(msg);
                }
            } else {
                compressed.add(msg);
            }
        }

        if (compressed.size() > maxMessages) {
            int removeFrom = systemCount + 1;
            int removeCount = compressed.size() - maxMessages;
            if (removeFrom < compressed.size()) {
                for (int i = 0; i < removeCount && removeFrom < compressed.size(); i++) {
                    compressed.remove(removeFrom);
                }
            }
        }

        log.debug("[ContextEngineering] 对话压缩: {}条→{}条 (超额{}条)",
                messages.size(), compressed.size(), excessCount);

        return compressed;
    }

    public String buildMidConversationSummary(List<AiMessage> messages, int olderThanIndex) {
        if (messages == null || messages.size() <= olderThanIndex) return "";

        StringBuilder summary = new StringBuilder();
        summary.append("## 对话早期回顾（自动摘要）\n");

        int userMsgCount = 0;
        int toolCallCount = 0;
        List<String> keyFindings = new ArrayList<>();

        for (int i = 0; i < Math.min(olderThanIndex, messages.size()); i++) {
            AiMessage msg = messages.get(i);

            if ("user".equals(msg.getRole())) {
                userMsgCount++;
                if (msg.getContent() != null) {
                    String shortContent = msg.getContent().length() > 60
                            ? msg.getContent().substring(0, 60) + "..."
                            : msg.getContent();
                    summary.append("- 用户询问: ").append(shortContent).append("\n");
                }
            } else if ("tool".equals(msg.getRole())) {
                toolCallCount++;
            } else if ("assistant".equals(msg.getRole()) && msg.getContent() != null) {
                keyFindings.add(msg.getContent().length() > 80
                        ? msg.getContent().substring(0, 80) + "..."
                        : msg.getContent());
            }
        }

        summary.append("共 ").append(userMsgCount).append(" 轮用户消息，")
                .append(toolCallCount).append(" 次工具调用\n");

        if (!keyFindings.isEmpty()) {
            summary.append("关键发现:\n");
            for (String finding : keyFindings) {
                summary.append("  - ").append(finding).append("\n");
            }
        }

        return summary.toString();
    }

    public List<AiTool> filterRelevantTools(List<AiTool> allTools, String userMessage) {
        if (allTools == null || allTools.size() <= 10) return allTools;

        String lower = userMessage != null ? userMessage.toLowerCase() : "";

        return allTools.stream()
                .filter(tool -> {
                    String name = tool.getFunction() != null ? tool.getFunction().getName().toLowerCase() : "";
                    String desc = tool.getFunction() != null && tool.getFunction().getDescription() != null
                            ? tool.getFunction().getDescription().toLowerCase() : "";

                    if (lower.isEmpty()) return true;

                    if (lower.contains("订单") && (name.contains("order") || name.contains("production"))) return true;
                    if (lower.contains("工厂") && (name.contains("factory") || name.contains("supplier"))) return true;
                    if (lower.contains("库存") && (name.contains("stock") || name.contains("inventory") || name.contains("warehouse"))) return true;
                    if (lower.contains("财务") || lower.contains("工资") || lower.contains("结算")) {
                        if (name.contains("payroll") || name.contains("financial") || name.contains("price")) return true;
                    }
                    if (lower.contains("质量") && (name.contains("quality") || name.contains("defect"))) return true;
                    if (lower.contains("进度") && (name.contains("progress") || name.contains("timeline"))) return true;
                    if (lower.contains("样衣") && name.contains("sample")) return true;

                    return name.contains("overview") || name.contains("search") || name.contains("knowledge")
                            || name.contains("think") || name.contains("dict");
                })
                .toList();
    }

    private List<String> extractAll(Pattern pattern, String text, int maxCount) {
        List<String> results = new ArrayList<>();
        if (text == null) return results;
        java.util.regex.Matcher m = pattern.matcher(text);
        while (m.find() && results.size() < maxCount) {
            String match = m.group();
            if (!results.contains(match)) {
                results.add(match);
            }
        }
        return results;
    }

    private List<String> extractKeyNumbers(String text, int maxCount) {
        List<String> keyNumbers = new ArrayList<>();
        if (text == null) return keyNumbers;

        String[] lines = text.split("\n");
        for (String line : lines) {
            if (keyNumbers.size() >= maxCount) break;
            java.util.regex.Matcher m = NUMBER_PATTERN.matcher(line);
            while (m.find() && keyNumbers.size() < maxCount) {
                String num = m.group();
                if (num.length() >= 2) {
                    keyNumbers.add(num);
                }
            }
        }
        return keyNumbers;
    }
}