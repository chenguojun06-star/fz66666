package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.AiLongMemory;
import com.fashion.supplychain.intelligence.mapper.AiLongMemoryMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
public class EntityMemoryContextService {

    private static final Pattern ORDER_NO_PATTERN = Pattern.compile("PO\\d{14}|[A-Z]{2,4}\\d{8,}");
    private static final Pattern STYLE_NO_PATTERN = Pattern.compile("[A-Z]{2,4}-?\\d{4,}[A-Z]?");
    private static final int ENTITY_MEMORY_LIMIT = 8;
    private static final int SEMANTIC_SEARCH_LIMIT = 3;

    @Autowired
    private AiLongMemoryMapper longMemoryMapper;

    @Autowired(required = false)
    private QdrantService qdrantService;

    public String buildEntityMemoryContext(Long tenantId, String userMessage) {
        if (tenantId == null || userMessage == null || userMessage.isBlank()) {
            return "";
        }

        StringBuilder ctx = new StringBuilder();

        try {
            String entityCtx = lookupEntityMemories(tenantId, userMessage);
            if (!entityCtx.isEmpty()) {
                ctx.append(entityCtx);
            }
        } catch (Exception e) {
            log.debug("[EntityMemory] 实体记忆加载跳过: {}", e.getMessage());
        }

        try {
            String semanticCtx = searchSimilarMemories(tenantId, userMessage);
            if (!semanticCtx.isEmpty()) {
                if (ctx.length() > 0) ctx.append("\n");
                ctx.append(semanticCtx);
            }
        } catch (Exception e) {
            log.debug("[EntityMemory] 语义记忆搜索跳过: {}", e.getMessage());
        }

        return ctx.toString();
    }

    private String lookupEntityMemories(Long tenantId, String userMessage) {
        Set<String> entityNames = extractEntityReferences(userMessage);
        if (entityNames.isEmpty()) {
            return "";
        }

        List<AiLongMemory> matched = new ArrayList<>();
        for (String entityName : entityNames) {
            LambdaQueryWrapper<AiLongMemory> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(AiLongMemory::getTenantId, tenantId)
                    .eq(AiLongMemory::getDeleteFlag, 0)
                    .like(AiLongMemory::getSubjectName, entityName)
                    .last("LIMIT " + ENTITY_MEMORY_LIMIT);
            List<AiLongMemory> results = longMemoryMapper.selectList(wrapper);
            matched.addAll(results);
        }

        if (matched.isEmpty()) {
            return "";
        }

        matched.sort((a, b) -> {
            int byConf = b.getConfidence().compareTo(a.getConfidence());
            if (byConf != 0) return byConf;
            int byHit = Integer.compare(
                    b.getHitCount() != null ? b.getHitCount() : 0,
                    a.getHitCount() != null ? a.getHitCount() : 0);
            return byHit;
        });

        StringBuilder sb = new StringBuilder("【相关实体记忆】\n");
        int count = 0;
        for (AiLongMemory mem : matched) {
            if (count >= ENTITY_MEMORY_LIMIT) break;
            if (mem.getContent() == null || mem.getContent().isBlank()) continue;
            String layerLabel = switch (mem.getLayer() != null ? mem.getLayer() : "") {
                case "FACT" -> "[事实]";
                case "EPISODIC" -> "[经验]";
                case "REFLECTIVE" -> "[反思]";
                default -> "";
            };
            sb.append("- ").append(layerLabel).append(" ")
                    .append(mem.getSubjectName() != null ? mem.getSubjectName() : "")
                    .append(": ").append(truncate(mem.getContent(), 200)).append("\n");
            count++;
        }

        if (count == 0) return "";
        return sb.toString();
    }

    private String searchSimilarMemories(Long tenantId, String userMessage) {
        if (qdrantService == null) {
            return "";
        }

        try {
            List<QdrantService.ScoredPoint> points = qdrantService.search(tenantId, userMessage, SEMANTIC_SEARCH_LIMIT);
            if (points == null || points.isEmpty()) {
                return "";
            }

            StringBuilder sb = new StringBuilder("【语义相似历史交互】\n");
            int count = 0;
            for (QdrantService.ScoredPoint point : points) {
                if (count >= SEMANTIC_SEARCH_LIMIT) break;
                if (point.getScore() < 0.5f) continue;
                String content = point.getPayload() != null ? point.getPayload().get("content") : null;
                String summary = point.getPayload() != null ? point.getPayload().get("summary") : null;
                if (content == null && summary == null) continue;

                String display = summary != null ? summary : content;
                sb.append("- [相似度:")
                        .append(String.format("%.0f%%", point.getScore() * 100))
                        .append("] ").append(truncate(display, 150)).append("\n");
                count++;
            }

            if (count == 0) return "";
            return sb.toString();
        } catch (Exception e) {
            log.debug("[EntityMemory] Qdrant语义检索跳过: {}", e.getMessage());
            return "";
        }
    }

    private Set<String> extractEntityReferences(String text) {
        Set<String> entities = new java.util.HashSet<>();
        Matcher orderMatcher = ORDER_NO_PATTERN.matcher(text);
        while (orderMatcher.find()) {
            entities.add(orderMatcher.group());
        }
        Matcher styleMatcher = STYLE_NO_PATTERN.matcher(text);
        while (styleMatcher.find()) {
            entities.add(styleMatcher.group());
        }
        return entities;
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return "";
        if (text.length() <= maxLen) return text;
        return text.substring(0, maxLen) + "...";
    }
}