package com.fashion.supplychain.intelligence.agent.content;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Component
public class ContentBlockParser {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final Pattern CHART_PATTERN = Pattern.compile(
            "【CHART】(.*?)【/CHART】", Pattern.DOTALL);
    private static final Pattern ACTIONS_PATTERN = Pattern.compile(
            "【ACTIONS】(.*?)【/ACTIONS】", Pattern.DOTALL);
    private static final Pattern INSIGHT_PATTERN = Pattern.compile(
            "【INSIGHT_CARDS】(.*?)【/INSIGHT_CARDS】", Pattern.DOTALL);
    private static final Pattern STEP_WIZARD_PATTERN = Pattern.compile(
            "【STEP_WIZARD】(.*?)【/STEP_WIZARD】", Pattern.DOTALL);
    private static final Pattern OVERDUE_FACTORY_PATTERN = Pattern.compile(
            "【OVERDUE_FACTORY】(.*?)【/OVERDUE_FACTORY】", Pattern.DOTALL);

    public List<ContentBlock> parse(String aiResponse) {
        if (aiResponse == null || aiResponse.isBlank()) {
            return List.of();
        }

        List<ContentBlock> blocks = new ArrayList<>();
        String remaining = aiResponse;

        remaining = extractBlocks(remaining, CHART_PATTERN, "chart", blocks);
        remaining = extractBlocks(remaining, ACTIONS_PATTERN, "action_card", blocks);
        remaining = extractBlocks(remaining, INSIGHT_PATTERN, "insight_card", blocks);
        remaining = extractBlocks(remaining, STEP_WIZARD_PATTERN, "step_wizard", blocks);
        remaining = extractBlocks(remaining, OVERDUE_FACTORY_PATTERN, "overdue_factory", blocks);

        if (!remaining.isBlank()) {
            blocks.add(0, new ContentBlock.TextBlock(remaining.trim()));
        }

        return blocks;
    }

    private String extractBlocks(String text, Pattern pattern, String blockType, List<ContentBlock> blocks) {
        Matcher matcher = pattern.matcher(text);
        StringBuffer sb = new StringBuffer();
        while (matcher.find()) {
            String jsonStr = matcher.group(1).trim();
            ContentBlock block = parseJsonBlock(blockType, jsonStr);
            if (block != null) {
                blocks.add(block);
            }
            matcher.appendReplacement(sb, "");
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    private ContentBlock parseJsonBlock(String blockType, String jsonStr) {
        try {
            JsonNode node = MAPPER.readTree(jsonStr);
            return switch (blockType) {
                case "chart" -> new ContentBlock.ChartBlock(
                        node.path("type").asText("bar"),
                        node.path("title").asText(""),
                        MAPPER.convertValue(node, Object.class));
                case "action_card" -> {
                    String title = node.isArray() && !node.isEmpty()
                            ? node.get(0).path("title").asText("")
                            : node.path("title").asText("");
                    yield new ContentBlock.ActionCardBlock(title, "", List.of());
                }
                case "insight_card" -> new ContentBlock.InsightCardBlock(
                        node.path("title").asText(""),
                        node.path("summary").asText(""),
                        node.path("severity").asText("info"),
                        Map.of());
                case "step_wizard" -> new ContentBlock.StepWizardBlock(
                        node.path("title").asText(""),
                        List.of(),
                        node.path("currentStep").asInt(0));
                default -> null;
            };
        } catch (Exception e) {
            log.debug("[ContentBlockParser] 解析 {} 块失败: {}", blockType, e.getMessage());
            return null;
        }
    }
}
