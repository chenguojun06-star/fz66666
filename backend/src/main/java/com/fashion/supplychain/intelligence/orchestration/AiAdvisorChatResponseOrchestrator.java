package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.dto.AiAdvisorChatResponse;
import com.fashion.supplychain.intelligence.dto.AiChartInfo;
import com.fashion.supplychain.intelligence.dto.HighRiskActionInfo;
import com.fashion.supplychain.intelligence.dto.XiaoyunInsightCard;
import com.fashion.supplychain.intelligence.helper.AiAgentToolExecHelper;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class AiAdvisorChatResponseOrchestrator {

    @Autowired
    private FollowUpSuggestionEngine followUpSuggestionEngine;

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern INSIGHT_CARD_PATTERN = Pattern.compile("【INSIGHT_CARDS】([\\s\\S]*?)【/INSIGHT_CARDS】");
    private static final Pattern CHART_PATTERN = Pattern.compile("【CHART】([\\s\\S]*?)【/CHART】");
    private static final Pattern AI_META_BLOCK_PATTERN = Pattern.compile("【(?:CHART|ACTIONS|TEAM_STATUS|BUNDLE_SPLIT|INSIGHT_CARDS|STEP_WIZARD|OVERDUE_FACTORY|REPORT_PREVIEW)】[\\s\\S]*?【/(?:CHART|ACTIONS|TEAM_STATUS|BUNDLE_SPLIT|INSIGHT_CARDS|STEP_WIZARD|OVERDUE_FACTORY|REPORT_PREVIEW)】|```ACTIONS_JSON\\s*\\n[\\s\\S]*?\\n```");

    public AiAdvisorChatResponse build(String question, String commandId, Result<String> agentResult) {
        return build(question, commandId, agentResult, Collections.emptyList());
    }

    public AiAdvisorChatResponse build(String question, String commandId, Result<String> agentResult,
                                        List<AiAgentToolExecHelper.ToolExecRecord> toolRecords) {
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
        response.setCharts(extractCharts(agentResult.getData()));
        response.setHighRiskActions(extractHighRiskActions(toolRecords));
        response.setSuggestions(buildSuggestions(question, response.getCards()));
        response.setFollowUpActions(followUpSuggestionEngine.generate(toolRecords, question));
        return response;
    }

    /** 功能 H：解析【CHART】JSON 块为结构化图表对象 */
    private List<AiChartInfo> extractCharts(String rawAnswer) {
        List<AiChartInfo> charts = new ArrayList<>();
        if (rawAnswer == null || rawAnswer.isBlank()) return charts;
        Matcher matcher = CHART_PATTERN.matcher(rawAnswer);
        while (matcher.find()) {
            String json = matcher.group(1);
            try {
                Map<String, Object> parsed = JSON.readValue(json, new TypeReference<Map<String, Object>>() {});
                AiChartInfo chart = new AiChartInfo();
                chart.setType(String.valueOf(parsed.getOrDefault("type", "bar")));
                chart.setTitle(String.valueOf(parsed.getOrDefault("title", "")));
                @SuppressWarnings("unchecked")
                Map<String, Object> cfg = (Map<String, Object>) parsed.get("config");
                chart.setConfig(cfg != null ? cfg : parsed);
                charts.add(chart);
            } catch (Exception e) {
                log.debug("[ChartExtract] 解析失败: {}", e.getMessage());
            }
        }
        return charts;
    }

    /** 双重确认：从 toolRecords 中筛出需确认的工具，生成确认条目 */
    private List<HighRiskActionInfo> extractHighRiskActions(List<AiAgentToolExecHelper.ToolExecRecord> toolRecords) {
        List<HighRiskActionInfo> actions = new ArrayList<>();
        if (toolRecords == null || toolRecords.isEmpty()) return actions;
        for (AiAgentToolExecHelper.ToolExecRecord rec : toolRecords) {
            if (rec == null || rec.toolName == null) continue;
            if (AiAgentToolAccessService.isWriteOperation(rec.toolName)) {
                HighRiskActionInfo info = new HighRiskActionInfo();
                info.setToolName(rec.toolName);
                String label = AiAgentToolAccessService.getConfirmLabel(rec.toolName);
                AiAgentToolAccessService.ConfirmLevel level = AiAgentToolAccessService.getConfirmLevel(rec.toolName);
                info.setConfirmLevel(level.name().toLowerCase());
                info.setOperationLabel(label);
                if (level == AiAgentToolAccessService.ConfirmLevel.HIGH_RISK) {
                    info.setDescription(label + "为高风险操作，执行前请确认");
                    info.setSeverity("warn");
                } else {
                    info.setDescription(label + "需要确认后执行");
                    info.setSeverity("info");
                }
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("arguments", rec.args);
                payload.put("resultPreview", rec.rawResult != null
                        ? (rec.rawResult.length() > 200 ? rec.rawResult.substring(0, 200) + "..." : rec.rawResult)
                        : null);
                info.setPayload(payload);
                actions.add(info);
            }
        }
        return actions;
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
            } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
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
