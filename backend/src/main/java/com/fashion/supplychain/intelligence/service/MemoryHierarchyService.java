package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiLongMemory;
import com.fashion.supplychain.intelligence.mapper.AiLongMemoryMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@Lazy
public class MemoryHierarchyService {

    @Autowired
    private AiLongMemoryMapper longMemoryMapper;

    @Autowired
    private org.springframework.beans.factory.ObjectProvider<MemoryConflictResolver> conflictResolverProvider;

    @Value("${xiaoyun.memory.max-working-items:20}")
    private int maxWorkingItems;

    @Value("${xiaoyun.memory.max-episodic-items:50}")
    private int maxEpisodicItems;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Data
    public static class WorkingMemoryItem {
        private String key;
        private String value;
        private long timestamp;
        private int relevance;
    }

    @Data
    public static class EpisodicMemoryItem {
        private String episodeId;
        private String summary;
        private String entities;
        private String outcome;
        private LocalDateTime timestamp;
        private int importance;
    }

    @Data
    public static class SemanticMemoryItem {
        private String concept;
        private String definition;
        private String relationships;
        private double confidence;
        private int hitCount;
    }

    @Data
    public static class CompiledMemory {
        private List<WorkingMemoryItem> workingItems;
        private List<EpisodicMemoryItem> recentEpisodes;
        private List<SemanticMemoryItem> relevantConcepts;
        private String contextSummary;

        public boolean isEmpty() {
            return (workingItems == null || workingItems.isEmpty())
                    && (recentEpisodes == null || recentEpisodes.isEmpty())
                    && (relevantConcepts == null || relevantConcepts.isEmpty());
        }
    }

    public CompiledMemory compileMemory(Long tenantId, String userMessage, int maxTokens) {
        CompiledMemory compiled = new CompiledMemory();

        compiled.setWorkingItems(loadWorkingMemory(tenantId, userMessage));
        compiled.setRecentEpisodes(loadRecentEpisodes(tenantId, userMessage));
        compiled.setRelevantConcepts(loadRelevantConcepts(tenantId, userMessage));
        compiled.setContextSummary(buildContextSummary(compiled));

        return compiled;
    }

    public String buildMemoryPromptInjection(Long tenantId, String userMessage, int maxTokens) {
        CompiledMemory memory = compileMemory(tenantId, userMessage, maxTokens);
        if (memory.isEmpty()) return "";

        StringBuilder sb = new StringBuilder();
        sb.append("## 记忆上下文（系统自动检索）\n");

        if (memory.getContextSummary() != null && !memory.getContextSummary().isBlank()) {
            sb.append("概要: ").append(memory.getContextSummary()).append("\n\n");
        }

        if (memory.getWorkingItems() != null && !memory.getWorkingItems().isEmpty()) {
            sb.append("当前会话关注点:\n");
            for (WorkingMemoryItem item : memory.getWorkingItems()) {
                sb.append("- ").append(item.getKey()).append(": ").append(item.getValue()).append("\n");
            }
            sb.append("\n");
        }

        if (memory.getRecentEpisodes() != null && !memory.getRecentEpisodes().isEmpty()) {
            sb.append("最近重要事件:\n");
            for (EpisodicMemoryItem ep : memory.getRecentEpisodes()) {
                sb.append("- [").append(ep.getImportance()).append("★] ")
                        .append(ep.getSummary());
                if (ep.getEntities() != null && !ep.getEntities().isBlank()) {
                    sb.append(" (涉及: ").append(ep.getEntities()).append(")");
                }
                sb.append("\n");
            }
            sb.append("\n");
        }

        if (memory.getRelevantConcepts() != null && !memory.getRelevantConcepts().isEmpty()) {
            sb.append("相关知识概念:\n");
            for (SemanticMemoryItem concept : memory.getRelevantConcepts()) {
                sb.append("- ").append(concept.getConcept()).append(": ")
                        .append(concept.getDefinition()).append(" (确信度:")
                        .append(String.format("%.0f%%", concept.getConfidence() * 100)).append(")\n");
            }
            sb.append("\n");
        }

        return sb.toString();
    }

    public void recordEpisode(Long tenantId, String userId, String summary,
                               String entities, String outcome, int importance) {
        try {
            AiLongMemory memory = new AiLongMemory();
            memory.setTenantId(tenantId);
            memory.setSourceUserId(userId);
            memory.setSubjectName(summary.length() > 100 ? summary.substring(0, 100) : summary);
            memory.setSubjectType("episodic");
            memory.setLayer("EPISODIC");

            Map<String, Object> content = new LinkedHashMap<>();
            content.put("type", "episodic");
            content.put("summary", summary);
            content.put("entities", entities);
            content.put("outcome", outcome);
            content.put("importance", importance);
            memory.setContent(MAPPER.writeValueAsString(content));

            memory.setConfidence(new BigDecimal("0.8"));
            memory.setHitCount(importance);
            memory.setDeleteFlag(0);
            memory.setCreateTime(LocalDateTime.now());
            memory.setUpdateTime(LocalDateTime.now());

            longMemoryMapper.insert(memory);
            log.debug("[MemoryHierarchy] 情景记忆记录: {}", summary.length() > 50 ? summary.substring(0, 50) : summary);

        } catch (Exception e) {
            log.debug("[MemoryHierarchy] 情景记忆记录失败: {}", e.getMessage());
        }
    }

    public void learnConcept(Long tenantId, String concept, String definition,
                              String relationships, double confidence) {
        try {
            AiLongMemory existing = longMemoryMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AiLongMemory>()
                            .eq(AiLongMemory::getTenantId, tenantId)
                            .eq(AiLongMemory::getSubjectName, concept)
                            .eq(AiLongMemory::getLayer, "SEMANTIC")
                            .eq(AiLongMemory::getDeleteFlag, 0)
                            .last("LIMIT 1"));

            if (existing != null) {
                existing.setHitCount((existing.getHitCount() != null ? existing.getHitCount() : 0) + 1);
                existing.setConfidence(new BigDecimal(Math.min(1.0,
                        existing.getConfidence().doubleValue() + confidence * 0.1)));
                existing.setUpdateTime(LocalDateTime.now());
                longMemoryMapper.updateById(existing);
            } else {
                AiLongMemory memory = new AiLongMemory();
                memory.setTenantId(tenantId);
                memory.setSourceUserId(UserContext.userId());
                memory.setSubjectName(concept);
                memory.setSubjectType("concept");
                memory.setLayer("SEMANTIC");

                Map<String, Object> content = new LinkedHashMap<>();
                content.put("concept", concept);
                content.put("definition", definition);
                content.put("relationships", relationships);
                memory.setContent(MAPPER.writeValueAsString(content));

                memory.setConfidence(new BigDecimal(confidence));
                memory.setHitCount(1);
                memory.setDeleteFlag(0);
                memory.setCreateTime(LocalDateTime.now());
                memory.setUpdateTime(LocalDateTime.now());
                memory.setValidFrom(LocalDateTime.now());

                MemoryConflictResolver resolver = conflictResolverProvider.getIfAvailable();
                if (resolver != null) {
                    resolver.upsertFactWithConflictResolution(memory);
                } else {
                    longMemoryMapper.insert(memory);
                }
            }

            log.debug("[MemoryHierarchy] 语义概念学习: {}", concept);
        } catch (Exception e) {
            log.debug("[MemoryHierarchy] 概念学习失败: {}", e.getMessage());
        }
    }

    private List<WorkingMemoryItem> loadWorkingMemory(Long tenantId, String userMessage) {
        List<WorkingMemoryItem> items = new ArrayList<>();

        try {
            List<AiLongMemory> memories = longMemoryMapper.selectList(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AiLongMemory>()
                            .eq(AiLongMemory::getTenantId, tenantId)
                            .eq(AiLongMemory::getDeleteFlag, 0)
                            .eq(AiLongMemory::getLayer, "WORKING")
                            .orderByDesc(AiLongMemory::getUpdateTime)
                            .last("LIMIT " + maxWorkingItems));

            for (AiLongMemory mem : memories) {
                WorkingMemoryItem item = new WorkingMemoryItem();
                item.setKey(mem.getSubjectName());
                item.setValue(mem.getContent() != null && mem.getContent().length() > 200
                        ? mem.getContent().substring(0, 200) : mem.getContent());
                item.setTimestamp(mem.getUpdateTime() != null
                        ? mem.getUpdateTime().atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
                        : System.currentTimeMillis());
                item.setRelevance(mem.getHitCount() != null ? mem.getHitCount() : 0);

                if (userMessage != null && mem.getSubjectName() != null
                        && userMessage.contains(mem.getSubjectName())) {
                    item.setRelevance(item.getRelevance() + 10);
                }

                items.add(item);
            }
        } catch (Exception e) {
            log.debug("[MemoryHierarchy] 工作记忆加载跳过: {}", e.getMessage());
        }

        return items;
    }

    private List<EpisodicMemoryItem> loadRecentEpisodes(Long tenantId, String userMessage) {
        List<EpisodicMemoryItem> episodes = new ArrayList<>();

        try {
            List<AiLongMemory> memories = longMemoryMapper.selectList(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AiLongMemory>()
                            .eq(AiLongMemory::getTenantId, tenantId)
                            .eq(AiLongMemory::getDeleteFlag, 0)
                            .eq(AiLongMemory::getLayer, "EPISODIC")
                            .orderByDesc(AiLongMemory::getCreateTime)
                            .last("LIMIT " + maxEpisodicItems));

            for (AiLongMemory mem : memories) {
                try {
                    Map<String, Object> content = MAPPER.readValue(mem.getContent(),
                            new TypeReference<LinkedHashMap<String, Object>>() {});

                    EpisodicMemoryItem ep = new EpisodicMemoryItem();
                    ep.setEpisodeId(mem.getId() != null ? mem.getId().toString() : "");
                    ep.setSummary(String.valueOf(content.getOrDefault("summary", mem.getSubjectName())));
                    ep.setEntities(String.valueOf(content.getOrDefault("entities", "")));
                    ep.setOutcome(String.valueOf(content.getOrDefault("outcome", "")));
                    ep.setImportance(mem.getHitCount() != null ? mem.getHitCount() : 1);
                    ep.setTimestamp(mem.getCreateTime());

                    episodes.add(ep);
                } catch (Exception ignored) {}
            }
        } catch (Exception e) {
            log.debug("[MemoryHierarchy] 情景记忆加载跳过: {}", e.getMessage());
        }

        return episodes.stream()
                .sorted(Comparator.comparingInt(EpisodicMemoryItem::getImportance).reversed())
                .limit(5)
                .collect(Collectors.toList());
    }

    private List<SemanticMemoryItem> loadRelevantConcepts(Long tenantId, String userMessage) {
        List<SemanticMemoryItem> concepts = new ArrayList<>();

        try {
            List<AiLongMemory> memories = longMemoryMapper.selectList(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AiLongMemory>()
                            .eq(AiLongMemory::getTenantId, tenantId)
                            .eq(AiLongMemory::getDeleteFlag, 0)
                            .eq(AiLongMemory::getLayer, "SEMANTIC")
                            .ge(AiLongMemory::getConfidence, new BigDecimal("0.5"))
                            .orderByDesc(AiLongMemory::getHitCount)
                            .last("LIMIT 20"));

            for (AiLongMemory mem : memories) {
                try {
                    Map<String, Object> content = MAPPER.readValue(mem.getContent(),
                            new TypeReference<LinkedHashMap<String, Object>>() {});

                    SemanticMemoryItem item = new SemanticMemoryItem();
                    item.setConcept(String.valueOf(content.getOrDefault("concept", mem.getSubjectName())));
                    item.setDefinition(String.valueOf(content.getOrDefault("definition", "")));
                    item.setRelationships(String.valueOf(content.getOrDefault("relationships", "")));
                    item.setConfidence(mem.getConfidence() != null ? mem.getConfidence().doubleValue() : 0.5);
                    item.setHitCount(mem.getHitCount() != null ? mem.getHitCount() : 0);

                    concepts.add(item);
                } catch (Exception ignored) {}
            }
        } catch (Exception e) {
            log.debug("[MemoryHierarchy] 语义记忆加载跳过: {}", e.getMessage());
        }

        return concepts.stream()
                .filter(c -> userMessage == null || c.getHitCount() >= 2
                        || (c.getConcept() != null && userMessage.contains(c.getConcept())))
                .limit(5)
                .collect(Collectors.toList());
    }

    private String buildContextSummary(CompiledMemory memory) {
        if (memory.isEmpty()) return "";

        StringBuilder sb = new StringBuilder();

        if (memory.getRecentEpisodes() != null && !memory.getRecentEpisodes().isEmpty()) {
            EpisodicMemoryItem latest = memory.getRecentEpisodes().get(0);
            sb.append("最近关注: ").append(latest.getSummary().length() > 80
                    ? latest.getSummary().substring(0, 80) + "..."
                    : latest.getSummary());
        }

        return sb.toString();
    }
}