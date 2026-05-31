package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Slf4j
@Service
public class ContextEngineeringService {

    @Value("${xiaoyun.context.max-tool-result-chars:2000}")
    private int maxToolResultChars;

    @Value("${xiaoyun.context.max-messages:30}")
    private int maxMessages;

    @Value("${xiaoyun.context.summarize-when-over:20}")
    private int summarizeWhenOver;

    private static final Pattern ORDER_NO_PATTERN = Pattern.compile("(ORD\\d+|PO\\d{14}|[A-Z]{2,4}\\d{8,})");
    private static final Pattern NUMBER_PATTERN = Pattern.compile("\\b\\d+(?:\\.\\d+)?%?\\b");
    private static final Pattern STATUS_PATTERN = Pattern.compile("(已完成|进行中|未开始|已逾期|已入库|待审批|已关闭|已报废|已取消)");
    private static final Pattern DATE_PATTERN = Pattern.compile("\\d{4}[-/]\\d{1,2}[-/]\\d{1,2}");

    public String summarizeToolResult(String toolName, String rawResult, String originalInput) {
        if (rawResult == null || rawResult.isBlank()) {
            return "工具 " + toolName + " 未返回数据";
        }

        if (rawResult.length() <= maxToolResultChars) {
            return rawResult;
        }

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