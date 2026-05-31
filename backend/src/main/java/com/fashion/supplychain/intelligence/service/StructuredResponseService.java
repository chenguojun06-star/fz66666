package com.fashion.supplychain.intelligence.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Slf4j
@Service
public class StructuredResponseService {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final Pattern CONFIDENCE_PATTERN = Pattern.compile(
            "(?i)(置信度|可信度|把握)[：:]*\\s*(\\d{1,3})\\s*%");
    private static final Pattern RISK_PATTERN = Pattern.compile(
            "(?i)(?:(🔴|🟠|🟡|🟢)\\s*)?(风险|逾期|异常|警告|注意)([：:]\\s*.+?)(?=[\\n;。]|$)");
    private static final Pattern ACTION_PATTERN = Pattern.compile(
            "(?:(\\d+)[.．、]\\s*)?(?:建议|行动|下一步|需要|必须|应该|请)([^。\\n]{10,80})[。\\n]");
    private static final Pattern DATA_PATTERN = Pattern.compile(
            "(?:(\\d+(?:\\.\\d+)?)\\s*(?:件|个|条|张|次|家|人|元|万|%|天|小时))");

    @Data
    public static class StructuredResponse {
        private String summary;
        private List<KeyInsight> insights;
        private List<ActionRecommendation> actions;
        private List<RiskAlert> risks;
        private Map<String, Object> dataPoints;
        private int confidenceScore;
        private String rawText;

        @Data
        public static class KeyInsight {
            private String title;
            private String detail;
            private String severity;
        }

        @Data
        public static class ActionRecommendation {
            private String action;
            private String assignee;
            private String deadline;
            private String expectedResult;
            private String priority;
        }

        @Data
        public static class RiskAlert {
            private String level;
            private String description;
            private String mitigation;
        }
    }

    public StructuredResponse parseStructuredResponse(String aiText) {
        StructuredResponse response = new StructuredResponse();
        response.setRawText(aiText);

        if (aiText == null || aiText.isBlank()) {
            response.setSummary("");
            response.setInsights(List.of());
            response.setActions(List.of());
            response.setRisks(List.of());
            response.setDataPoints(Map.of());
            response.setConfidenceScore(70);
            return response;
        }

        response.setConfidenceScore(extractConfidenceScore(aiText));
        response.setSummary(extractSummary(aiText));
        response.setInsights(extractInsights(aiText));
        response.setActions(extractActions(aiText));
        response.setRisks(extractRisks(aiText));
        response.setDataPoints(extractDataPoints(aiText));

        return response;
    }

    public String enrichWithStructuredFormat(String aiText) {
        if (aiText == null || aiText.isBlank()) return aiText;

        StructuredResponse parsed = parseStructuredResponse(aiText);

        if (parsed.getConfidenceScore() < 50) {
            return aiText + "\n\n> ⚠️ AI自评可信度较低（" + parsed.getConfidenceScore()
                    + "%），建议核实数据后再做决策";
        }

        return aiText;
    }

    public String buildStructuredOutputPrompt() {
        return """
## 结构化输出要求

请按以下结构组织你的回答（在自然语言中内嵌这些要素，不要用标签分隔）：

1. **第一句话给出结论**：直接告诉用户最关键的信息和数字
2. **数据支撑**：引用工具查询返回的具体数字，标注来源
3. **洞察分析**（≤3条）：每条洞察包含具体发现+影响+建议
4. **行动建议**（≤3条）：每条包含谁、做什么、什么时候、预期结果
5. **风险预警**（如有）：标注风险等级(🔴🟠🟡🟢) + 具体描述 + 缓解措施

自评可信度：在回答末尾标注你对本次回答的把握程度（0-100%），如：[可信度: 85%]

## 示例：
"张三，你好！上周你们工厂总共有12个生产订单，其中3个已经逾期，逾期率25%。今天有2个订单需要在下午5点前完成出货。

逾期订单ORD2024001（已逾期2天）需要优先处理，建议张厂长今天上午联系尾部主管确认包装进度。另外，ORD2024005的裁剪排期比原计划晚了3天，这意味着后续车缝环节也会有3天延迟。

行动建议：
1. 张厂长今天上午联系尾部主管，确认ORD2024001包装进度，今天完成出货
2. 核对ORD2024005裁剪排期，调整车缝计划，避免连锁延期
3. 本周五前安排ORD2024002质检，提前预防尾部积压

🟠 风险提示：ORD2024005如不调整排期，预计5月15日后整体交期延迟3天，可能影响客户A的月底结算。

[可信度: 92%]"
""";
    }

    private int extractConfidenceScore(String text) {
        if (text == null) return 70;
        java.util.regex.Matcher m = CONFIDENCE_PATTERN.matcher(text);
        if (m.find()) {
            try {
                int score = Integer.parseInt(m.group(2));
                return Math.min(100, Math.max(0, score));
            } catch (NumberFormatException e) {
                return 70;
            }
        }

        if (text.contains("据我所知") || text.contains("我认为") || text.contains("可能")) return 50;
        if (text.contains("根据系统数据") || text.contains("查询结果显示")) return 85;
        if (text.contains("绝对") || text.contains("肯定")) {
            boolean hasDataRef = text.contains("ORD") || text.contains("数据显示")
                    || text.contains("根据") || text.contains("统计");
            return hasDataRef ? 90 : 60;
        }

        return 70;
    }

    private String extractSummary(String text) {
        if (text == null || text.isBlank()) return "";
        String[] parts = text.split("(?<=[。！？\\n])\\s*", 2);
        String first = parts[0].trim();
        if (first.length() > 200) {
            first = first.substring(0, 200);
        }
        return first;
    }

    private List<StructuredResponse.KeyInsight> extractInsights(String text) {
        List<StructuredResponse.KeyInsight> insights = new ArrayList<>();
        if (text == null) return insights;

        String[] paragraphs = text.split("\n\n+");
        for (String para : paragraphs) {
            String trimmed = para.trim();
            if (trimmed.length() < 20) continue;

            boolean isInsight = trimmed.contains("发现") || trimmed.contains("根据")
                    || trimmed.contains("显示") || trimmed.contains("分析")
                    || trimmed.contains("对比") || trimmed.contains("趋势");

            if (isInsight) {
                StructuredResponse.KeyInsight insight = new StructuredResponse.KeyInsight();
                insight.setDetail(trimmed.length() > 150 ? trimmed.substring(0, 150) + "..." : trimmed);

                if (trimmed.contains("🔴")) insight.setSeverity("critical");
                else if (trimmed.contains("🟠")) insight.setSeverity("high");
                else if (trimmed.contains("🟡")) insight.setSeverity("medium");
                else insight.setSeverity("info");

                insights.add(insight);
                if (insights.size() >= 3) break;
            }
        }
        return insights;
    }

    private List<StructuredResponse.ActionRecommendation> extractActions(String text) {
        List<StructuredResponse.ActionRecommendation> actions = new ArrayList<>();
        if (text == null) return actions;

        java.util.regex.Matcher m = ACTION_PATTERN.matcher(text);
        while (m.find() && actions.size() < 3) {
            StructuredResponse.ActionRecommendation action = new StructuredResponse.ActionRecommendation();
            String fullAction = m.group(2) != null ? m.group(2).trim() : "";
            action.setAction(fullAction);

            if (fullAction.contains("联系")) action.setAssignee("相关人员");
            if (fullAction.contains("今天")) action.setDeadline("今天");
            else if (fullAction.contains("明天")) action.setDeadline("明天");
            else if (fullAction.contains("本周")) action.setDeadline("本周");
            else action.setDeadline("尽快");

            if (fullAction.contains("🔴") || fullAction.contains("紧急")) action.setPriority("urgent");
            else if (fullAction.contains("🟠")) action.setPriority("high");
            else action.setPriority("normal");

            actions.add(action);
        }
        return actions;
    }

    private List<StructuredResponse.RiskAlert> extractRisks(String text) {
        List<StructuredResponse.RiskAlert> risks = new ArrayList<>();
        if (text == null) return risks;

        java.util.regex.Matcher m = RISK_PATTERN.matcher(text);
        while (m.find() && risks.size() < 3) {
            StructuredResponse.RiskAlert risk = new StructuredResponse.RiskAlert();
            String levelIndicator = m.group(1);
            if ("🔴".equals(levelIndicator)) risk.setLevel("critical");
            else if ("🟠".equals(levelIndicator)) risk.setLevel("high");
            else if ("🟡".equals(levelIndicator)) risk.setLevel("medium");
            else risk.setLevel("low");

            risk.setDescription(m.group(3) != null ? m.group(3).trim() : m.group(0).trim());
            risks.add(risk);
        }
        return risks;
    }

    private Map<String, Object> extractDataPoints(String text) {
        Map<String, Object> dataPoints = new LinkedHashMap<>();
        if (text == null) return dataPoints;

        java.util.regex.Matcher m = DATA_PATTERN.matcher(text);
        int count = 0;
        while (m.find() && count < 10) {
            try {
                String value = m.group(1);
                if (value.length() >= 2) {
                    dataPoints.put("data_" + count, value);
                    count++;
                }
            } catch (Exception ignored) {}
        }

        return dataPoints;
    }
}