package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.KgEntity;
import com.fashion.supplychain.intelligence.entity.KgRelation;
import com.fashion.supplychain.intelligence.mapper.KgEntityMapper;
import com.fashion.supplychain.intelligence.mapper.KgRelationMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class KnowledgeGraphOrchestrator {

    private final KgEntityMapper entityMapper;
    private final KgRelationMapper relationMapper;
    private final IntelligenceInferenceOrchestrator inferenceOrchestrator;
    private final ObjectMapper objectMapper;

    @Data
    public static class ReasoningPath {
        private List<String> entityNames = new ArrayList<>();
        private List<String> relationTypes = new ArrayList<>();
        private String pathDescription;
        private double confidence;
    }

    public List<ReasoningPath> reason(Long tenantId, String query, int maxHops) {
        List<KgEntity> matchedEntities = findMatchingEntities(tenantId, query);
        if (matchedEntities.isEmpty()) return Collections.emptyList();

        List<ReasoningPath> allPaths = new ArrayList<>();
        for (KgEntity entity : matchedEntities.subList(0, Math.min(3, matchedEntities.size()))) {
            List<Map<String, Object>> rawPaths = entityMapper.traverseGraph(entity.getId(), maxHops);
            allPaths.addAll(convertToReasoningPaths(rawPaths, entity.getEntityName()));
        }
        allPaths.sort((a, b) -> Double.compare(b.getConfidence(), a.getConfidence()));
        return allPaths.subList(0, Math.min(5, allPaths.size()));
    }

    private List<KgEntity> findMatchingEntities(Long tenantId, String query) {
        return entityMapper.selectList(
                new LambdaQueryWrapper<KgEntity>()
                        .eq(KgEntity::getDeleteFlag, 0)
                        .and(w -> w.isNull(KgEntity::getTenantId).or().eq(KgEntity::getTenantId, tenantId))
                        .and(w -> w.like(KgEntity::getEntityName, query)
                                .or().like(KgEntity::getEntityType, query)
                                .or().like(KgEntity::getPropertiesJson, query))
                        .last("LIMIT 10"));
    }

    private List<ReasoningPath> convertToReasoningPaths(List<Map<String, Object>> rawPaths, String startName) {
        Map<String, ReasoningPath> pathMap = new LinkedHashMap<>();
        for (Map<String, Object> row : rawPaths) {
            String targetName = String.valueOf(row.get("entity_name"));
            String relType = String.valueOf(row.get("relation_type"));
            int hop = ((Number) row.get("hop")).intValue();

            String key = startName + "→" + targetName;
            pathMap.computeIfAbsent(key, k -> {
                ReasoningPath p = new ReasoningPath();
                p.getEntityNames().add(startName);
                p.setConfidence(1.0 / hop);
                return p;
            });
            ReasoningPath path = pathMap.get(key);
            path.getEntityNames().add(targetName);
            path.getRelationTypes().add(relType);
            path.setPathDescription(String.join(" → ", path.getEntityNames()));
        }
        return new ArrayList<>(pathMap.values());
    }

    @Async
    public void buildGraphFromBusinessData(Long tenantId) {
        UserContext ctx = new UserContext();
        ctx.setTenantId(tenantId);
        ctx.setUserId("SYSTEM");
        UserContext.set(ctx);
        log.info("[KnowledgeGraph] Building graph for tenant {}", tenantId);
        try {
            upsertEntity(tenantId, "supplier", "供应商", null, null);
            upsertEntity(tenantId, "order", "生产订单", null, null);
            upsertEntity(tenantId, "style", "款式", null, null);
            upsertEntity(tenantId, "process", "工序", null, null);
            upsertEntity(tenantId, "factory", "工厂", null, null);
            log.info("[KnowledgeGraph] Graph building completed for tenant {}", tenantId);
        } catch (Exception e) {
            log.warn("[KnowledgeGraph] buildGraphFromBusinessData failed: {}", e.getMessage());
        } finally {
            UserContext.clear();
        }
    }

    public KgEntity upsertEntity(Long tenantId, String type, String name, String externalId, String propertiesJson) {
        KgEntity existing = entityMapper.selectOne(
                new LambdaQueryWrapper<KgEntity>()
                        .eq(KgEntity::getTenantId, tenantId)
                        .eq(KgEntity::getEntityType, type)
                        .eq(KgEntity::getEntityName, name)
                        .eq(KgEntity::getDeleteFlag, 0)
                        .last("LIMIT 1"));
        if (existing != null) {
            if (propertiesJson != null) {
                existing.setPropertiesJson(propertiesJson);
                entityMapper.updateById(existing);
            }
            return existing;
        }
        KgEntity entity = new KgEntity();
        entity.setTenantId(tenantId);
        entity.setEntityType(type);
        entity.setEntityName(name);
        entity.setExternalId(externalId);
        entity.setPropertiesJson(propertiesJson);
        entity.setDeleteFlag(0);
        entityMapper.insert(entity);
        return entity;
    }

    public void upsertRelation(Long tenantId, Long sourceId, Long targetId, String relationType, Double weight) {
        KgRelation existing = relationMapper.selectOne(
                new LambdaQueryWrapper<KgRelation>()
                        .eq(KgRelation::getTenantId, tenantId)
                        .eq(KgRelation::getSourceId, sourceId)
                        .eq(KgRelation::getTargetId, targetId)
                        .eq(KgRelation::getRelationType, relationType)
                        .eq(KgRelation::getDeleteFlag, 0)
                        .last("LIMIT 1"));
        if (existing != null) {
            if (weight != null) existing.setWeight(weight);
            relationMapper.updateById(existing);
            return;
        }
        KgRelation rel = new KgRelation();
        rel.setTenantId(tenantId);
        rel.setSourceId(sourceId);
        rel.setTargetId(targetId);
        rel.setRelationType(relationType);
        rel.setWeight(weight != null ? weight : 1.0);
        rel.setDeleteFlag(0);
        relationMapper.insert(rel);
    }
}
