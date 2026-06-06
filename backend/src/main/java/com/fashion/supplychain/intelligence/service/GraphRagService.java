package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.entity.KgEntity;
import com.fashion.supplychain.intelligence.entity.KgRelation;
import com.fashion.supplychain.intelligence.mapper.KgEntityMapper;
import com.fashion.supplychain.intelligence.mapper.KgRelationMapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class GraphRagService {

    @Autowired private KgRelationMapper kgRelationMapper;

    @Autowired private KgEntityMapper kgEntityMapper;

    private static final int MAX_HOPS = 2;
    private static final int MAX_ENTITIES = 3;
    private static final int MAX_OUTPUT_LINES = 12;

    public String buildGraphContext(Long tenantId, String userMessage) {
        if (userMessage == null || userMessage.isBlank()) return "";
        try {
            List<String> keywords = extractKeywords(userMessage);
            if (keywords.isEmpty()) return "";

            Set<Long> seenEntityIds = new HashSet<>();
            List<String> graphLines = new ArrayList<>();

            for (String keyword : keywords) {
                if (graphLines.size() >= MAX_OUTPUT_LINES) break;
                List<KgEntity> matchedEntities = kgEntityMapper.searchEntities(tenantId, keyword, MAX_ENTITIES);
                for (KgEntity entity : matchedEntities) {
                    if (graphLines.size() >= MAX_OUTPUT_LINES) break;
                    if (!seenEntityIds.add(entity.getId())) continue;

                    List<Map<String, Object>> paths = kgEntityMapper.traverseGraph(entity.getId(), MAX_HOPS);
                    if (paths.isEmpty()) {
                        graphLines.add(String.format("  %s [%s] (无关联实体)",
                                entity.getEntityName(), translateType(entity.getEntityType())));
                        continue;
                    }

                    Set<Long> relatedIds = new HashSet<>();
                    for (Map<String, Object> path : paths) {
                        Object targetIdObj = path.get("target_id");
                        if (targetIdObj == null) continue;
                        Long targetId = ((Number) targetIdObj).longValue();
                        if (!relatedIds.add(targetId)) continue;

                        String relType = Objects.toString(path.get("relation_type"), "关联");
                        String entityName = Objects.toString(path.get("entity_name"), "?");
                        int hop = path.get("hop") != null ? ((Number) path.get("hop")).intValue() : 1;
                        String hopLabel = hop > 1 ? "(+" + hop + "跳)" : "";
                        graphLines.add(String.format("  %s --[%s]--> %s %s",
                                entity.getEntityName(), translateRelation(relType), entityName, hopLabel));
                    }
                }
            }

            if (graphLines.isEmpty()) return "";
            StringBuilder sb = new StringBuilder("【知识图谱关系链】\n");
            graphLines.forEach(line -> sb.append(line).append("\n"));
            sb.append("（以上为知识图谱结构化关系，可用于关联推理）\n");
            return sb.toString();
        } catch (Exception e) {
            log.debug("[GraphRAG] 图谱检索跳过: {}", e.getMessage());
            return "";
        }
    }

    private List<String> extractKeywords(String userMessage) {
        List<String> keywords = new ArrayList<>();
        String[] entityPatterns = {
                "工厂|供应商|加工厂|外协厂", "订单|生产单|工单", "面料|材料|辅料",
                "款号|款式|样品|样衣|版型", "工序|工艺|裁床|缝制|整烫", "客户|品牌|买家"
        };
        for (String pattern : entityPatterns) {
            for (String token : pattern.split("\\|")) {
                if (userMessage.contains(token)) {
                    keywords.add(token);
                    break;
                }
            }
        }
        return keywords.stream().distinct().limit(3).collect(Collectors.toList());
    }

    private String translateType(String type) {
        if (type == null) return "实体";
        return switch (type) {
            case "ORDER" -> "订单";
            case "FACTORY" -> "工厂";
            case "PRODUCT" -> "产品";
            case "CUSTOMER" -> "客户";
            case "SUPPLIER" -> "供应商";
            case "MATERIAL" -> "材料";
            case "PROCESS" -> "工序";
            default -> type;
        };
    }

    private String translateRelation(String relation) {
        if (relation == null) return "关联";
        return switch (relation) {
            case "MANUFACTURED_BY" -> "生产于";
            case "SUPPLIED_BY" -> "供应于";
            case "BELONGS_TO" -> "属于";
            case "CONTAINS" -> "包含";
            case "ALTERNATIVE" -> "可替代";
            case "COMES_FROM" -> "来源于";
            case "REQUIRES" -> "需要";
            default -> relation;
        };
    }

    /**
     * 将业务实体写入知识图谱并建立关系。幂等操作。
     *
     * @param tenantId         租户ID
     * @param sourceEntityType 源实体类型 (ORDER/FACTORY/STYLE/MATERIAL/CUSTOMER)
     * @param sourceEntityName 源实体名称
     * @param sourceExternalId 源实体业务ID
     * @param targetEntityType 目标实体类型
     * @param targetEntityName 目标实体名称
     * @param targetExternalId 目标实体业务ID
     * @param relationType     关系类型
     */
    @Transactional(rollbackFor = Exception.class)
    public void recordRelation(
            Long tenantId,
            String sourceEntityType, String sourceEntityName, String sourceExternalId,
            String targetEntityType, String targetEntityName, String targetExternalId,
            String relationType
    ) {
        Long sourceId = upsertEntity(tenantId, sourceEntityType, sourceEntityName, sourceExternalId);
        Long targetId = upsertEntity(tenantId, targetEntityType, targetEntityName, targetExternalId);

        if (sourceId == null || targetId == null) return;
        if (sourceId.equals(targetId)) return;

        QueryWrapper<KgRelation> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
          .eq("source_id", sourceId)
          .eq("target_id", targetId)
          .eq("relation_type", relationType)
          .eq("delete_flag", 0);

        if (kgRelationMapper.selectCount(qw) == 0) {
            KgRelation rel = new KgRelation();
            rel.setTenantId(tenantId);
            rel.setSourceId(sourceId);
            rel.setTargetId(targetId);
            rel.setRelationType(relationType);
            rel.setWeight(1.0);
            rel.setDeleteFlag(0);
            rel.setCreatedAt(LocalDateTime.now());
            kgRelationMapper.insert(rel);
            log.debug("[GraphRAG] 新建关系: {} --[{}]--> {}", sourceEntityName, relationType, targetEntityName);
        }
    }

    /** Upsert 实体：按 tenantId + entityType + externalId 查重 */
    private Long upsertEntity(Long tenantId, String entityType, String entityName, String externalId) {
        if (entityName == null || entityName.isBlank()) return null;
        QueryWrapper<KgEntity> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId)
          .eq("entity_type", entityType)
          .eq("external_id", externalId)
          .eq("delete_flag", 0);
        KgEntity existing = kgEntityMapper.selectOne(qw);
        if (existing != null) return existing.getId();

        KgEntity entity = new KgEntity();
        entity.setTenantId(tenantId);
        entity.setEntityType(entityType);
        entity.setEntityName(entityName);
        entity.setExternalId(externalId);
        entity.setDeleteFlag(0);
        entity.setCreatedAt(LocalDateTime.now());
        entity.setUpdatedAt(LocalDateTime.now());
        kgEntityMapper.insert(entity);
        return entity.getId();
    }

    /**
     * 批量同步知识图谱关系。适用于初始化或定时全量同步。
     */
    public int batchSyncRelations(Long tenantId, List<Map<String, String>> relations) {
        int created = 0;
        for (Map<String, String> r : relations) {
            try {
                recordRelation(tenantId,
                        r.get("sourceType"), r.get("sourceName"), r.get("sourceExternalId"),
                        r.get("targetType"), r.get("targetName"), r.get("targetExternalId"),
                        r.getOrDefault("relationType", "RELATED"));
                created++;
            } catch (Exception e) {
                log.debug("[GraphRAG] 同步跳过: {}", e.getMessage());
            }
        }
        log.info("[GraphRAG] 批量同步: {}条关系", created);
        return created;
    }
}