package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.dto.AiAdvisorChatResponse;
import com.fashion.supplychain.intelligence.dto.XiaoyunInsightCard;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

@Service
public class AiAdvisorChatResponseOrchestrator {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern INSIGHT_CARD_PATTERN = Pattern.compile("【INSIGHT_CARDS】([\\s\\S]*?)【/INSIGHT_CARDS】");
    private static final Pattern AI_META_BLOCK_PATTERN = Pattern.compile("【(?:CHART|ACTIONS|TEAM_STATUS|BUNDLE_SPLIT|INSIGHT_CARDS)】[\\s\\S]*?【/(?:CHART|ACTIONS|TEAM_STATUS|BUNDLE_SPLIT|INSIGHT_CARDS)】|```ACTIONS_JSON\\s*\\n[\\s\\S]*?\\n```");

    public AiAdvisorChatResponse build(String question, String commandId, Result<String> agentResult) {
        AiAdvisorChatResponse response = new AiAdvisorChatResponse();
        response.setCommandId(commandId);
        if (!Integer.valueOf(200).equals(agentResult.getCode())) {
            response.setAnswer(agentResult.getMessage());
            response.setDisplayAnswer(agentResult.getMessage());
            response.setSource("error");
            return response;
        }
        response.setAnswer(agentResult.getData());
        response.setDisplayAnswer(stripAiMeta(agentResult.getData()));
        response.setSource("ai");
        response.setCards(extractInsightCards(agentResult.getData()));
        response.setSuggestions(buildSuggestions(question, response.getCards()));
        return response;
    }

    private List<XiaoyunInsightCard> extractInsightCards(String rawAnswer) {
        if (rawAnswer == null || rawAnswer.isBlank()) {
            return new ArrayList<>();
        }
        Matcher matcher = INSIGHT_CARD_PATTERN.matcher(rawAnswer);
        List<XiaoyunInsightCard> cards = new ArrayList<>();
        while (matcher.find()) {
            String json = matcher.group(1);
            try {
                List<XiaoyunInsightCard> parsed = JSON.readValue(json, new TypeReference<List<XiaoyunInsightCard>>() {});
                cards.addAll(parsed);
            } catch (Exception ignored) {
            }
        }
        return cards;
    }

    private String stripAiMeta(String rawAnswer) {
        if (rawAnswer == null) {
            return null;
        }
        return AI_META_BLOCK_PATTERN.matcher(rawAnswer).replaceAll("").trim();
    }

    private List<String> buildSuggestions(String question, List<XiaoyunInsightCard> cards) {
        List<String> suggestions = new ArrayList<>();
        if (cards != null && !cards.isEmpty()) {
            boolean hasApproval = cards.stream().anyMatch(card -> card != null && String.valueOf(card.getTitle()).contains("审批"));
            boolean hasRisk = cards.stream().anyMatch(card -> card != null && (String.valueOf(card.getTitle()).contains("风险") || String.valueOf(card.getTitle()).contains("瓶颈") || String.valueOf(card.getTitle()).contains("工厂效率")));
            boolean hasLearning = cards.stream().anyMatch(card -> card != null && String.valueOf(card.getTitle()).contains("下单学习"));
            if (hasLearning) {
                suggestions.add("继续分析这单为什么这样推荐");
                suggestions.add("刷新这单学习结果");
                suggestions.add("把这个款号的学习样本重刷一下");
            }
            if (hasApproval) {
                suggestions.add("列出剩余待审批");
                suggestions.add("通过第一条审批");
            }
            if (hasRisk) {
                suggestions.add("把最高风险订单单独列出来");
                suggestions.add("告诉我先处理哪几单");
            }
        }
        if (suggestions.isEmpty() && question != null && (question.contains("订单") || question.contains("款") || question.contains("成本"))) {
            suggestions.add("分析这单为什么成本高");
            suggestions.add("推荐这单怎么下更划算");
        }
        return suggestions;
    }
}
