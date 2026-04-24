package com.fashion.supplychain.intelligence.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class CragEvaluator {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final double HIGH_RELEVANCE = 0.7;
    private static final double LOW_RELEVANCE = 0.3;

    public enum RelevanceLevel { HIGH, MEDIUM, LOW, EMPTY }

    public record CragResult(RelevanceLevel level, double topScore, String filteredContext) {}

    public CragResult evaluate(String knowledgeJson) {
        if (knowledgeJson == null || knowledgeJson.isBlank()
                || "[]".equals(knowledgeJson.trim())
                || "null".equalsIgnoreCase(knowledgeJson.trim())) {
            return new CragResult(RelevanceLevel.EMPTY, 0, "");
        }

        try {
            JsonNode root = MAPPER.readTree(knowledgeJson);
            double topScore = extractTopScore(root);

            if (topScore >= HIGH_RELEVANCE) {
                return new CragResult(RelevanceLevel.HIGH, topScore, knowledgeJson);
            }
            if (topScore >= LOW_RELEVANCE) {
                String filtered = filterLowScoreItems(root, LOW_RELEVANCE);
                return new CragResult(RelevanceLevel.MEDIUM, topScore, filtered);
            }
            return new CragResult(RelevanceLevel.LOW, topScore, knowledgeJson);
        } catch (Exception e) {
            log.debug("[CRAG] 解析知识库JSON失败，按MEDIUM处理: {}", e.getMessage());
            return new CragResult(RelevanceLevel.MEDIUM, 0.5, knowledgeJson);
        }
    }

    private double extractTopScore(JsonNode root) {
        JsonNode items = root.path("items");
        if (items.isArray() && !items.isEmpty()) {
            double max = 0;
            for (JsonNode item : items) {
                double s = item.path("hybridScore").asDouble(0);
                if (s > max) max = s;
            }
            return max;
        }
        if (root.path("hybridScore").asDouble(0) > 0) {
            return root.path("hybridScore").asDouble(0);
        }
        return 0.5;
    }

    private String filterLowScoreItems(JsonNode root, double threshold) {
        try {
            JsonNode items = root.path("items");
            if (items.isArray()) {
                var arr = MAPPER.createArrayNode();
                for (JsonNode item : items) {
                    if (item.path("hybridScore").asDouble(0) >= threshold) {
                        arr.add(item);
                    }
                }
                var obj = MAPPER.createObjectNode();
                obj.set("items", arr);
                return MAPPER.writeValueAsString(obj);
            }
        } catch (Exception e) {
            log.debug("[CRAG] 过滤失败，返回原文: {}", e.getMessage());
        }
        return root.toString();
    }
}
