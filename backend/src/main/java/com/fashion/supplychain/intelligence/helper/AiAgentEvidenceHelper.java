package com.fashion.supplychain.intelligence.helper;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Slf4j
@Component
public class AiAgentEvidenceHelper {

    private static final ObjectMapper JSON = new ObjectMapper();
    public static final int MAX_TOOL_RAW_CHARS = 3000;

    public String buildToolEvidenceMessage(String toolName, String toolResult) {
        if (toolResult == null || toolResult.isBlank()) {
            return "【工具证据】\n- 工具: " + toolName + "\n- 结果: 空结果";
        }
        try {
            JsonNode root = JSON.readTree(toolResult);
            if (root.hasNonNull("error")) {
                return "【工具证据】\n- 工具: " + toolName + "\n- 状态: 失败\n- 错误: " + truncate(root.path("error").asText(), 400);
            }

            StringBuilder evidence = new StringBuilder("【工具证据】\n- 工具: ").append(toolName).append("\n");

            if ("tool_knowledge_search".equals(toolName)) {
                appendKnowledgeEvidence(evidence, root);
            } else if ("tool_whatif".equals(toolName)) {
                appendWhatIfEvidence(evidence, root);
            } else if ("tool_multi_agent".equals(toolName)) {
                appendMultiAgentEvidence(evidence, root);
            } else {
                appendGenericEvidence(evidence, root);
            }

            int rawLimit = resolveRawExcerptLimit(toolName);
            if (rawLimit > 0) {
                String raw = toolResult.length() > rawLimit ? toolResult.substring(0, rawLimit) + "…(截断)" : toolResult;
                evidence.append("- 原始数据: ").append(StatusTranslator.sanitize(raw)).append("\n");
            }
            return evidence.toString();
        } catch (Exception e) {
            log.debug("[AiAgent] 工具证据构建回退原始文本: tool={}", toolName);
            return "【工具证据】\n- 工具: " + toolName + "\n- 原始结果: " + StatusTranslator.sanitize(truncate(toolResult, MAX_TOOL_RAW_CHARS));
        }
    }

    private void appendKnowledgeEvidence(StringBuilder evidence, JsonNode root) {
        evidence.append("- 检索模式: ").append(root.path("retrievalMode").asText("hybrid")).append("\n");
        evidence.append("- 命中: ").append(root.path("count").asInt(0))
                .append("条（语义").append(root.path("semanticHits").asInt(0))
                .append("/关键词").append(root.path("keywordHits").asInt(0)).append("）\n");

        JsonNode items = root.path("items");
        if (items.isArray()) {
            for (int i = 0; i < Math.min(items.size(), 3); i++) {
                JsonNode item = items.get(i);
                evidence.append("  ").append(i + 1).append(". ")
                        .append(item.path("title").asText("无标题"))
                        .append("（分类: ").append(item.path("category").asText(""))
                        .append("，混合分: ").append(String.format("%.2f", item.path("hybridScore").asDouble(0d)))
                        .append("，语义分: ").append(String.format("%.2f", item.path("semanticScore").asDouble(0d)))
                        .append("，关键词分: ").append(String.format("%.2f", item.path("keywordScore").asDouble(0d)))
                        .append("）\n  内容: ").append(truncate(item.path("content").asText(""), 90)).append("\n");
            }
        }
    }

    private void appendWhatIfEvidence(StringBuilder evidence, JsonNode root) {
        evidence.append("- 摘要: ").append(truncate(root.path("summary").asText(""), 120)).append("\n");
        evidence.append("- 推荐方案: ").append(root.path("recommended").asText("无")).append("\n");

        JsonNode baseline = root.path("baseline");
        if (!baseline.isMissingNode() && !baseline.isNull()) {
            evidence.append("- 基线: ").append(baseline.path("desc").asText(baseline.path("key").asText("当前方案")))
                    .append("，评分").append(String.format("%.0f", baseline.path("score").asDouble(0d))).append("\n");
        }

        JsonNode scenarios = root.path("scenarios");
        if (scenarios.isArray()) {
            for (int i = 0; i < Math.min(scenarios.size(), 3); i++) {
                JsonNode scenario = scenarios.get(i);
                evidence.append("- 方案").append(i + 1).append(": ")
                        .append(scenario.path("desc").asText(scenario.path("key").asText("scenario")))
                        .append("，评分").append(String.format("%.0f", scenario.path("score").asDouble(0d)))
                        .append("，完工变化").append(scenario.path("finishDeltaDays").asInt(0)).append("天")
                        .append("，成本变化").append(scenario.path("costDelta").asDouble(0d))
                        .append("，风险变化").append(scenario.path("riskDelta").asDouble(0d))
                        .append("，动作: ").append(truncate(scenario.path("action").asText(""), 60))
                        .append("\n");
            }
        }
    }

    public void captureTeamDispatchCard(String toolName, String toolResult, List<JsonNode> teamDispatchCards) {
        if (!"tool_team_dispatch".equals(toolName) || toolResult == null || toolResult.isBlank()) {
            return;
        }
        try {
            JsonNode root = JSON.readTree(toolResult);
            if (!root.path("success").asBoolean(false)) {
                return;
            }
            teamDispatchCards.add(root);
        } catch (Exception e) {
            log.debug("[AiAgent] 解析协同派单结果失败: {}", e.getMessage());
        }
    }

    public String appendTeamDispatchCards(String content, List<JsonNode> teamDispatchCards) {
        if (teamDispatchCards == null || teamDispatchCards.isEmpty()) {
            return content;
        }
        try {
            String json = JSON.writeValueAsString(teamDispatchCards);
            return (content == null ? "" : content) + "\n\n【TEAM_STATUS】" + json + "【/TEAM_STATUS】";
        } catch (Exception e) {
            log.debug("[AiAgent] 拼接协同状态卡失败: {}", e.getMessage());
            return content;
        }
    }

    public void captureBundleSplitCard(String toolName, String toolResult, List<JsonNode> bundleSplitCards) {
        if (!"tool_bundle_split_transfer".equals(toolName) || toolResult == null || toolResult.isBlank()) {
            return;
        }
        try {
            JsonNode root = JSON.readTree(toolResult);
            if (!root.path("success").asBoolean(false)) {
                return;
            }
            bundleSplitCards.add(root);
        } catch (Exception e) {
            log.debug("[AiAgent] 解析拆菲转派结果失败: {}", e.getMessage());
        }
    }

    public void captureStepWizardCard(String toolName, String toolResult, List<JsonNode> stepWizardCards) {
        if (toolResult == null || toolResult.isBlank()) {
            return;
        }
        try {
            JsonNode root = JSON.readTree(toolResult);
            JsonNode wizard = root.path("stepWizard");
            if (wizard.isMissingNode() || !wizard.isObject()) {
                return;
            }
            stepWizardCards.add(wizard);
        } catch (Exception e) {
            log.debug("[AiAgent] 解析步骤引导卡失败: {}", e.getMessage());
        }
    }

    public String appendBundleSplitCards(String content, List<JsonNode> bundleSplitCards) {
        if (bundleSplitCards == null || bundleSplitCards.isEmpty()) {
            return content;
        }
        try {
            String json = JSON.writeValueAsString(bundleSplitCards);
            return (content == null ? "" : content) + "\n\n【BUNDLE_SPLIT】" + json + "【/BUNDLE_SPLIT】";
        } catch (Exception e) {
            log.debug("[AiAgent] 拼接拆菲转派卡失败: {}", e.getMessage());
            return content;
        }
    }

    public String appendStepWizardCards(String content, List<JsonNode> stepWizardCards) {
        if (stepWizardCards == null || stepWizardCards.isEmpty()) {
            return content;
        }
        try {
            String json = JSON.writeValueAsString(stepWizardCards);
            return (content == null ? "" : content) + "\n\n【STEP_WIZARD】" + json + "【/STEP_WIZARD】";
        } catch (Exception e) {
            log.debug("[AiAgent] 拼接步骤引导卡失败: {}", e.getMessage());
            return content;
        }
    }

    private void appendMultiAgentEvidence(StringBuilder evidence, JsonNode root) {
        evidence.append("- 路由场景: ").append(root.path("route").asText("unknown")).append("\n");
        if (root.hasNonNull("context")) {
            evidence.append("- 上下文摘要: ").append(truncate(root.path("context").asText(), 120)).append("\n");
        }
        if (root.hasNonNull("reflection")) {
            evidence.append("- 反思结论: ").append(truncate(root.path("reflection").asText(), 120)).append("\n");
        }
        if (root.hasNonNull("optimization")) {
            evidence.append("- 优化建议: ").append(truncate(root.path("optimization").asText(), 120)).append("\n");
        }
        JsonNode specialists = root.path("specialists");
        if (specialists != null && specialists.isObject()) {
            List<String> names = new ArrayList<>();
            specialists.fieldNames().forEachRemaining(names::add);
            if (!names.isEmpty()) {
                evidence.append("- 专家输出: ").append(String.join(", ", names)).append("\n");
            }
        }
    }

    private void appendGenericEvidence(StringBuilder evidence, JsonNode root) {
        if (root.hasNonNull("summary")) {
            evidence.append("- 摘要: ").append(StatusTranslator.sanitize(truncate(root.path("summary").asText(), 120))).append("\n");
        } else if (root.hasNonNull("message")) {
            evidence.append("- 消息: ").append(StatusTranslator.sanitize(truncate(root.path("message").asText(), 120))).append("\n");
        }

        JsonNode countNode = root.path("count");
        if (countNode.isNumber()) {
            evidence.append("- 数量: ").append(countNode.asInt()).append("\n");
        }

        JsonNode items = root.path("items");
        if (items.isArray() && items.size() > 0) {
            for (int i = 0; i < Math.min(items.size(), 3); i++) {
                JsonNode item = items.get(i);
                evidence.append("- 条目").append(i + 1).append(": ")
                        .append(StatusTranslator.sanitize(extractBestLabel(item))).append("\n");
            }
        } else {
            List<String> keys = new ArrayList<>();
            root.fieldNames().forEachRemaining(k -> keys.add(StatusTranslator.translateField(k)));
            if (!keys.isEmpty()) {
                evidence.append("- 顶层字段: ").append(String.join(", ", keys.subList(0, Math.min(keys.size(), 8)))).append("\n");
            }
        }
    }

    private String extractBestLabel(JsonNode item) {
        if (item == null || item.isMissingNode() || item.isNull()) {
            return "空条目";
        }
        String[] fields = new String[] {"title", "name", "orderNo", "order_no", "styleNo", "sku", "summary", "desc"};
        for (String field : fields) {
            String value = item.path(field).asText("").trim();
            if (!value.isEmpty()) {
                return truncate(value, 90);
            }
        }
        return truncate(item.toString(), 90);
    }

    public static String truncate(String text, int maxLength) {
        if (text == null) {
            return "";
        }
        if (text.length() <= maxLength) {
            return text;
        }
        return text.substring(0, Math.max(0, maxLength - 1)) + "…";
    }

    public static String truncateOneLine(String text, int maxLength) {
        return truncate(text == null ? "" : text.replace("\n", " ").replace("\r", " "), maxLength);
    }

    private int resolveRawExcerptLimit(String toolName) {
        if ("tool_multi_agent".equals(toolName)) {
            return 0;
        }
        if ("tool_whatif".equals(toolName) || "tool_knowledge_search".equals(toolName)) {
            return 800;
        }
        return MAX_TOOL_RAW_CHARS;
    }
}
