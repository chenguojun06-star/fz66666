package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.dto.XiaoyunInsightCard;
import com.fashion.supplychain.intelligence.dto.XiaoyunStructuredResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@Slf4j
@RequiredArgsConstructor
public class XiaoyunResponseParser {

    private final ObjectMapper objectMapper;

    private static final Pattern INSIGHT_PATTERN = Pattern.compile("【INSIGHT_CARDS】(.*?)【/INSIGHT_CARDS】", Pattern.DOTALL);
    private static final Pattern ACTION_PATTERN = Pattern.compile("【ACTIONS】(.*?)【/ACTIONS】", Pattern.DOTALL);
    private static final Pattern CHART_PATTERN = Pattern.compile("【CHART】(.*?)【/CHART】", Pattern.DOTALL);
    private static final Pattern STEP_PATTERN = Pattern.compile("【STEP_WIZARD】(.*?)【/STEP_WIZARD】", Pattern.DOTALL);
    private static final Pattern CLARIFICATION_PATTERN = Pattern.compile("【CLARIFICATION】(.*?)【/CLARIFICATION】", Pattern.DOTALL);
    private static final Pattern OVERDUE_PATTERN = Pattern.compile("【OVERDUE_FACTORY】(.*?)【/OVERDUE_FACTORY】", Pattern.DOTALL);
    private static final Pattern REPORT_PATTERN = Pattern.compile("【REPORT_PREVIEW】(.*?)【/REPORT_PREVIEW】", Pattern.DOTALL);
    private static final Pattern ALL_TAGS = Pattern.compile("【[A-Z_]+】.*?【/[A-Z_]+】", Pattern.DOTALL);

    public XiaoyunStructuredResponse parse(String rawContent) {
        if (rawContent == null || rawContent.isBlank()) {
            return new XiaoyunStructuredResponse();
        }

        XiaoyunStructuredResponse response = new XiaoyunStructuredResponse();
        response.setInsightCards(parseBlock(rawContent, INSIGHT_PATTERN, new TypeReference<List<XiaoyunInsightCard>>() {}));
        response.setActionCards(parseBlock(rawContent, ACTION_PATTERN, new TypeReference<List<XiaoyunStructuredResponse.XiaoyunActionCard>>() {}));
        response.setCharts(parseBlock(rawContent, CHART_PATTERN, new TypeReference<List<XiaoyunStructuredResponse.XiaoyunChartSpec>>() {}));
        response.setStepWizards(parseBlock(rawContent, STEP_PATTERN, new TypeReference<List<XiaoyunStructuredResponse.XiaoyunStepWizard>>() {}));
        response.setClarifications(parseBlock(rawContent, CLARIFICATION_PATTERN, new TypeReference<List<XiaoyunStructuredResponse.XiaoyunClarification>>() {}));
        response.setOverdueFactory(parseSingleBlock(rawContent, OVERDUE_PATTERN, XiaoyunStructuredResponse.XiaoyunOverdueFactory.class));
        response.setReportPreview(parseSingleBlock(rawContent, REPORT_PATTERN, XiaoyunStructuredResponse.XiaoyunReportPreview.class));

        String displayText = ALL_TAGS.matcher(rawContent).replaceAll("").trim();
        response.setDisplayText(displayText);

        return response;
    }

    private <T> List<T> parseBlock(String content, Pattern pattern, TypeReference<List<T>> typeRef) {
        Matcher matcher = pattern.matcher(content);
        if (!matcher.find()) return new ArrayList<>();
        try {
            String json = matcher.group(1).trim();
            return objectMapper.readValue(json, typeRef);
        } catch (Exception e) {
            log.warn("[XiaoyunParser] Failed to parse block: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    private <T> T parseSingleBlock(String content, Pattern pattern, Class<T> clazz) {
        Matcher matcher = pattern.matcher(content);
        if (!matcher.find()) return null;
        try {
            String json = matcher.group(1).trim();
            return objectMapper.readValue(json, clazz);
        } catch (Exception e) {
            log.warn("[XiaoyunParser] Failed to parse single block: {}", e.getMessage());
            return null;
        }
    }
}
