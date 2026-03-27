package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class XiaoyunInsightCardOrchestrator {

    private static final ObjectMapper JSON = new ObjectMapper();

    public void collectFromToolResult(String toolName, String toolResult, List<JsonNode> insightCards) {
        if (toolResult == null || toolResult.isBlank()) {
            return;
        }
        try {
            JsonNode root = JSON.readTree(toolResult);
            if ("tool_order_learning".equals(toolName)) {
                if (!root.path("success").asBoolean(false)) {
                    return;
                }
                addIfPresent(insightCards, buildOrderLearningRecommendationCard(root));
                addIfPresent(insightCards, buildOrderLearningGapCard(root));
                addIfPresent(insightCards, buildOrderLearningRefreshCard(root));
                return;
            }
            if ("tool_change_approval".equals(toolName)) {
                addIfPresent(insightCards, buildApprovalInsightCard(root));
                return;
            }
            if ("tool_deep_analysis".equals(toolName)) {
                addIfPresent(insightCards, buildRiskInsightCard(root));
            }
        } catch (Exception e) {
            log.debug("[XiaoyunCard] 解析工具结果失败: tool={}, err={}", toolName, e.getMessage());
        }
    }

    public String appendToContent(String content, List<JsonNode> insightCards) {
        if (insightCards == null || insightCards.isEmpty()) {
            return content;
        }
        try {
            String json = JSON.writeValueAsString(insightCards);
            return (content == null ? "" : content) + "\n\n【INSIGHT_CARDS】" + json + "【/INSIGHT_CARDS】";
        } catch (Exception e) {
            log.debug("[XiaoyunCard] 拼接信息卡失败: {}", e.getMessage());
            return content;
        }
    }

    private void addIfPresent(List<JsonNode> insightCards, JsonNode card) {
        if (card != null) {
            insightCards.add(card);
        }
    }

    private JsonNode buildOrderLearningRecommendationCard(JsonNode root) {
        String summary = root.path("summary").asText("");
        String actionSuggestion = root.path("actionSuggestion").asText("");
        String gapInsight = root.path("gapInsight").asText("");
        if (summary.isBlank() && actionSuggestion.isBlank()) {
            return null;
        }
        ObjectNode card = JSON.createObjectNode();
        card.put("level", "info");
        card.put("title", "下单学习建议");
        card.put("summary", summary.isBlank() ? "系统已生成下单学习建议" : summary);
        if (!gapInsight.isBlank()) {
            card.put("painPoint", gapInsight);
        }
        if (!actionSuggestion.isBlank()) {
            card.put("execute", actionSuggestion);
        }
        card.put("confidence", "AI 学习建议");
        card.put("source", "下单学习");
        ArrayNode evidence = JSON.createArrayNode();
        if (root.hasNonNull("recommendedFactoryMode")) {
            evidence.add("推荐生产方式：" + root.path("recommendedFactoryMode").asText());
        }
        if (root.hasNonNull("recommendedPricingMode")) {
            evidence.add("推荐单价口径：" + root.path("recommendedPricingMode").asText());
        }
        if (root.hasNonNull("recommendedUnitPrice")) {
            evidence.add("推荐参考单价：¥" + root.path("recommendedUnitPrice").asText());
        }
        card.set("evidence", evidence);
        return card;
    }

    private JsonNode buildOrderLearningGapCard(JsonNode root) {
        if (!root.hasNonNull("extraTotalCostIfKeepCurrent") && !root.hasNonNull("extraUnitCostIfKeepCurrent")) {
            return null;
        }
        ObjectNode card = JSON.createObjectNode();
        card.put("level", "warning");
        card.put("title", "当前方案差异");
        if (root.hasNonNull("extraTotalCostIfKeepCurrent")) {
            card.put("summary", "继续当前方案，整单预计多花 ¥" + root.path("extraTotalCostIfKeepCurrent").asText());
        } else {
            card.put("summary", "继续当前方案，单件预计多花 ¥" + root.path("extraUnitCostIfKeepCurrent").asText());
        }
        if (root.hasNonNull("gapInsight")) {
            card.put("painPoint", root.path("gapInsight").asText());
        }
        if (root.hasNonNull("actionSuggestion")) {
            card.put("execute", root.path("actionSuggestion").asText());
        }
        card.put("confidence", "建议优先处理");
        card.put("source", "成本差异");
        return card;
    }

    private JsonNode buildOrderLearningRefreshCard(JsonNode root) {
        String message = root.path("message").asText("");
        if (message.isBlank() || (!message.contains("刷新") && !message.contains("重刷"))) {
            return null;
        }
        ObjectNode card = JSON.createObjectNode();
        card.put("level", "success");
        card.put("title", "学习结果已刷新");
        card.put("summary", message);
        card.put("execute", "现在可以继续追问最新建议或重新查看该单/该款的学习结论。");
        card.put("confidence", "执行完成");
        card.put("source", "下单学习");
        ArrayNode evidence = JSON.createArrayNode();
        if (root.hasNonNull("orderNo")) {
            evidence.add("订单号：" + root.path("orderNo").asText());
        }
        if (root.hasNonNull("styleNo")) {
            evidence.add("款号：" + root.path("styleNo").asText());
        }
        if (root.hasNonNull("refreshedCount")) {
            evidence.add("刷新数量：" + root.path("refreshedCount").asText());
        }
        card.set("evidence", evidence);
        return card;
    }

    private JsonNode buildApprovalInsightCard(JsonNode root) {
        if (root == null || root.path("error").isTextual()) {
            return null;
        }
        if (root.has("items") && root.path("items").isArray()) {
            int total = root.path("total").asInt(root.path("items").size());
            JsonNode first = root.path("items").size() > 0 ? root.path("items").get(0) : null;
            ObjectNode card = JSON.createObjectNode();
            card.put("level", total > 0 ? "warning" : "success");
            card.put("title", "待审批摘要");
            card.put("summary", total > 0 ? "当前有 " + total + " 条待审批申请" : root.path("message").asText("当前没有待审批申请"));
            if (first != null) {
                card.put("painPoint", "优先关注：" + first.path("type").asText("变更申请") + " · " + first.path("targetNo").asText(""));
                card.put("execute", "可以继续说“通过第一个审批”或“驳回某条申请并写原因”。");
                ArrayNode evidence = JSON.createArrayNode();
                evidence.add("申请人：" + first.path("applicant").asText("-"));
                evidence.add("原因：" + truncate(first.path("reason").asText(""), 50));
                evidence.add("申请时间：" + first.path("applyTime").asText("-"));
                card.set("evidence", evidence);
            }
            card.put("confidence", total > 0 ? "待处理事项" : "审批清空");
            card.put("source", "审批中心");
            return card;
        }
        if (root.path("success").asBoolean(false) && root.hasNonNull("message")) {
            ObjectNode card = JSON.createObjectNode();
            card.put("level", "success");
            card.put("title", "审批动作完成");
            card.put("summary", root.path("message").asText());
            card.put("execute", "如需继续处理，可继续让小云列出剩余待审批。");
            card.put("confidence", "执行完成");
            card.put("source", "审批中心");
            return card;
        }
        return null;
    }

    private JsonNode buildRiskInsightCard(JsonNode root) {
        String analysisType = root.path("analysisType").asText("");
        if (!"delivery_risk".equals(analysisType) && !"factory_ranking".equals(analysisType) && !"bottleneck".equals(analysisType)) {
            return null;
        }
        JsonNode brief = root.path("managementBrief");
        if (brief == null || brief.isMissingNode()) {
            return null;
        }
        ObjectNode card = JSON.createObjectNode();
        card.put("level", mapRiskLevel(brief.path("riskLevel").asText("YELLOW")));
        card.put("title", "delivery_risk".equals(analysisType) ? "交期风险摘要" : "factory_ranking".equals(analysisType) ? "工厂效率摘要" : "瓶颈摘要");
        card.put("summary", brief.path("headline").asText("已生成风险分析摘要"));
        JsonNode actions = brief.path("recommendedActions");
        if (actions.isArray() && actions.size() > 0) {
            card.put("execute", actions.get(0).asText());
            ArrayNode evidence = JSON.createArrayNode();
            for (int i = 1; i < Math.min(actions.size(), 4); i++) {
                evidence.add(actions.get(i).asText());
            }
            card.set("evidence", evidence);
        }
        JsonNode ownerRoles = brief.path("ownerRoles");
        if (ownerRoles.isArray() && ownerRoles.size() > 0) {
            List<String> roles = new ArrayList<>();
            ownerRoles.forEach(item -> roles.add(item.asText()));
            card.put("painPoint", "建议责任人：" + String.join("、", roles));
        }
        card.put("confidence", "管理简报");
        card.put("source", "深度分析");
        return card;
    }

    private String mapRiskLevel(String riskLevel) {
        return switch (riskLevel == null ? "" : riskLevel.toUpperCase()) {
            case "RED" -> "danger";
            case "ORANGE" -> "warning";
            case "GREEN" -> "success";
            default -> "info";
        };
    }

    private String truncate(String text, int maxLength) {
        if (text == null) {
            return "";
        }
        if (text.length() <= maxLength) {
            return text;
        }
        return text.substring(0, Math.max(0, maxLength)) + "...";
    }
}
