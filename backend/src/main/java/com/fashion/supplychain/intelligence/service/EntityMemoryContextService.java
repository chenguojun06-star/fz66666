package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.AiLongMemory;
import com.fashion.supplychain.intelligence.mapper.AiLongMemoryMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@Lazy
public class EntityMemoryContextService {

    private static final Pattern ORDER_NO_PATTERN = Pattern.compile("PO\\d{14}|[A-Z]{2,4}\\d{8,}");
    private static final Pattern STYLE_NO_PATTERN = Pattern.compile("[A-Z]{2,4}-?\\d{4,}[A-Z]?");
    private static final int ENTITY_MEMORY_LIMIT = 8;
    private static final int SEMANTIC_SEARCH_LIMIT = 3;

    @Autowired
    private AiLongMemoryMapper longMemoryMapper;

    @Autowired(required = false)
    private QdrantService qdrantService;

    /**
     * 【P1-9修复】专用 Executor：原 CompletableFuture.supplyAsync 未指定 Executor，
     * 默认使用 ForkJoinPool.commonPool()，与 JVM 其他共用 commonPool 的任务争抢资源，
     * 且 commonPool 大小受限于 CPU 核数（默认 -1），高并发时易饱和导致 AI Prompt 构建超时。
     * 现复用 AsyncConfig.taskExecutor（core=20, max=50, queue=2000），隔离 AI 任务与 parallelStream。
     */
    @Autowired
    @Qualifier("taskExecutor")
    private Executor taskExecutor;

    public String buildEntityMemoryContext(Long tenantId, String userMessage) {
        if (tenantId == null || userMessage == null || userMessage.isBlank()) {
            return "";
        }

        // DB 实体记忆查询与 Qdrant 语义向量搜索无依赖关系，并行执行（原串行 200-500ms → 并行 ≤ max(单步)）
        // 【P1-9修复】指定 taskExecutor 替代 ForkJoinPool.commonPool
        CompletableFuture<String> entityFuture = CompletableFuture.supplyAsync(() -> {
            try {
                return lookupEntityMemories(tenantId, userMessage);
            } catch (Exception e) {
                log.debug("[EntityMemory] 实体记忆加载跳过: {}", e.getMessage());
                return "";
            }
        }, taskExecutor);

        CompletableFuture<String> semanticFuture = CompletableFuture.supplyAsync(() -> {
            try {
                return searchSimilarMemories(tenantId, userMessage);
            } catch (Exception e) {
                log.debug("[EntityMemory] 语义记忆搜索跳过: {}", e.getMessage());
                return "";
            }
        }, taskExecutor);

        // 等待两路完成（2s 超时保护，单步失败不影响另一步）
        String entityCtx = "";
        String semanticCtx = "";
        try {
            CompletableFuture.allOf(entityFuture, semanticFuture).get(2, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.debug("[EntityMemory] 并行构建部分超时: {}", e.getMessage());
        }
        try {
            entityCtx = entityFuture.getNow("");
        } catch (Exception ignored) { }
        try {
            semanticCtx = semanticFuture.getNow("");
        } catch (Exception ignored) { }

        // 保持原有合并格式：entityCtx 在前，semanticCtx 在后，中间用 \n 分隔
        StringBuilder ctx = new StringBuilder();
        if (entityCtx != null && !entityCtx.isEmpty()) {
            ctx.append(entityCtx);
        }
        if (semanticCtx != null && !semanticCtx.isEmpty()) {
            if (ctx.length() > 0) ctx.append("\n");
            ctx.append(semanticCtx);
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