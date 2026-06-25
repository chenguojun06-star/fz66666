package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.entity.KgEntity;
import com.fashion.supplychain.intelligence.entity.KgRelation;
import com.fashion.supplychain.intelligence.mapper.KgEntityMapper;
import com.fashion.supplychain.intelligence.mapper.KgRelationMapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@Lazy
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

    // ==================== GraphRAG 深度集成升级 ====================

    /**
     * GraphRAG 分层检索：先找相关社区，再找社区内的实体和关系。
     * <p>比传统关键词检索质量更高，因为它利用了图结构的社区信息。
     */
    public String buildGraphRagContext(Long tenantId, String userMessage) {
        if (userMessage == null || userMessage.isBlank()) return "";
        try {
            // 1. 增强实体提取：识别用户消息中的业务实体
            List<KgEntity> seedEntities = extractEntitiesFromMessage(tenantId, userMessage);
            if (seedEntities.isEmpty()) {
                // 退化为关键词检索
                return buildGraphContext(tenantId, userMessage);
            }

            // 2. 社区发现：以种子实体为中心，发现相关社区
            List<GraphCommunity> communities = discoverCommunities(tenantId, seedEntities);
            if (communities.isEmpty()) {
                return buildGraphContext(tenantId, userMessage);
            }

            // 3. 分层检索：社区级摘要 + 关键实体关系
            StringBuilder sb = new StringBuilder("【GraphRAG 知识图谱洞察】\n");

            int communityIdx = 1;
            for (GraphCommunity community : communities) {
                if (sb.length() > 1500) break;  // Token 预算保护

                sb.append("\n▎相关主题 ").append(communityIdx++)
                        .append("：").append(community.getSummary()).append("\n");
                sb.append("  核心实体：").append(community.getCoreEntities()).append("\n");

                // 社区内关键关系（按权重排序）
                List<String> keyRelations = community.getKeyRelations();
                for (int i = 0; i < Math.min(5, keyRelations.size()); i++) {
                    sb.append("  • ").append(keyRelations.get(i)).append("\n");
                }
            }

            // 4. 推理路径推荐
            List<String> reasoningPaths = buildReasoningPaths(seedEntities, communities);
            if (!reasoningPaths.isEmpty()) {
                sb.append("\n▎推理路径建议：\n");
                for (int i = 0; i < Math.min(3, reasoningPaths.size()); i++) {
                    sb.append("  → ").append(reasoningPaths.get(i)).append("\n");
                }
            }

            sb.append("\n（以上为知识图谱结构化关系，可用于关联推理和交叉验证）\n");
            log.info("[GraphRAG] 分层检索完成: 种子实体={} 社区={}", seedEntities.size(), communities.size());
            return sb.toString();
        } catch (Exception e) {
            log.warn("[GraphRAG] 分层检索异常，降级为关键词检索: {}", e.getMessage());
            return buildGraphContext(tenantId, userMessage);
        }
    }

    /**
     * 增强实体提取：从用户消息中识别具体的业务实体。
     * <p>比关键词匹配更精准，因为它匹配实体名称而不只是类型关键词。
     */
    private List<KgEntity> extractEntitiesFromMessage(Long tenantId, String userMessage) {
        List<KgEntity> results = new ArrayList<>();
        Set<Long> seenIds = new HashSet<>();

        // 策略1：直接搜索实体名称（模糊匹配）
        // 将用户消息分词，尝试匹配实体名称
        String[] tokens = userMessage.split("[，。！？、\\s]+");
        for (String token : tokens) {
            if (token.length() < 2) continue;
            List<KgEntity> found = kgEntityMapper.searchEntities(tenantId, token, 5);
            for (KgEntity entity : found) {
                if (seenIds.add(entity.getId())) {
                    results.add(entity);
                }
            }
            if (results.size() >= 5) break;
        }

        // 策略2：如果直接搜索没结果，用类型关键词兜底
        if (results.isEmpty()) {
            List<String> typeKeywords = extractKeywords(userMessage);
            for (String keyword : typeKeywords) {
                List<KgEntity> found = kgEntityMapper.searchEntities(tenantId, keyword, 3);
                for (KgEntity entity : found) {
                    if (seenIds.add(entity.getId())) {
                        results.add(entity);
                    }
                }
                if (results.size() >= 3) break;
            }
        }

        return results;
    }

    /**
     * 社区发现：以种子实体为中心，通过 BFS 发现连接紧密的实体社区。
     * <p>这是 GraphRAG 的核心能力：将大图拆分为小社区，每个社区生成摘要。
     */
    private List<GraphCommunity> discoverCommunities(Long tenantId, List<KgEntity> seedEntities) {
        List<GraphCommunity> communities = new ArrayList<>();
        Set<Long> visitedEntities = new HashSet<>();

        for (KgEntity seed : seedEntities) {
            if (visitedEntities.contains(seed.getId())) continue;

            // BFS 发现社区（2跳以内的实体）
            Set<Long> communityEntityIds = new HashSet<>();
            List<KgEntity> communityEntities = new ArrayList<>();
            List<String> communityRelations = new ArrayList<>();
            Map<String, Integer> typeCount = new HashMap<>();

            // BFS 队列
            Queue<Long> queue = new LinkedList<>();
            queue.add(seed.getId());
            communityEntityIds.add(seed.getId());
            communityEntities.add(seed);
            typeCount.merge(seed.getEntityType(), 1, Integer::sum);

            int hops = 0;
            while (!queue.isEmpty() && hops < 2 && communityEntityIds.size() < 20) {
                int levelSize = queue.size();
                for (int i = 0; i < levelSize && communityEntityIds.size() < 20; i++) {
                    Long currentId = queue.poll();
                    List<Map<String, Object>> neighbors = kgEntityMapper.traverseGraph(currentId, 1);

                    for (Map<String, Object> neighbor : neighbors) {
                        Object targetIdObj = neighbor.get("target_id");
                        if (targetIdObj == null) continue;
                        Long targetId = ((Number) targetIdObj).longValue();

                        if (communityEntityIds.add(targetId)) {
                            // 找到新实体
                            String entityName = Objects.toString(neighbor.get("entity_name"), "?");
                            String entityType = Objects.toString(neighbor.get("entity_type"), "UNKNOWN");
                            String relType = Objects.toString(neighbor.get("relation_type"), "关联");
                            String sourceName = Objects.toString(neighbor.get("source_name"), seed.getEntityName());

                            KgEntity newEntity = new KgEntity();
                            newEntity.setId(targetId);
                            newEntity.setEntityName(entityName);
                            newEntity.setEntityType(entityType);
                            communityEntities.add(newEntity);

                            communityRelations.add(String.format("%s --[%s]--> %s",
                                    sourceName, translateRelation(relType), entityName));

                            typeCount.merge(entityType, 1, Integer::sum);
                            queue.add(targetId);
                        }
                    }
                }
                hops++;
            }

            visitedEntities.addAll(communityEntityIds);

            // 生成社区摘要
            if (communityEntityIds.size() >= 2) {
                GraphCommunity community = new GraphCommunity();
                community.setCoreEntities(buildCoreEntityList(communityEntities));
                community.setSummary(buildCommunitySummary(communityEntities, typeCount));
                community.setKeyRelations(communityRelations);
                community.setEntityCount(communityEntityIds.size());
                communities.add(community);
            }
        }

        // 按社区大小排序（实体多的社区信息量更大）
        communities.sort((a, b) -> Integer.compare(b.getEntityCount(), a.getEntityCount()));
        return communities.subList(0, Math.min(3, communities.size()));
    }

    /** 构建社区摘要文本 */
    private String buildCommunitySummary(List<KgEntity> entities, Map<String, Integer> typeCount) {
        StringBuilder sb = new StringBuilder();
        // 找主导实体类型
        String dominantType = typeCount.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse("UNKNOWN");
        sb.append(translateType(dominantType)).append("关联网络");
        // 加上实体数量
        sb.append("（").append(entities.size()).append("个实体）");
        return sb.toString();
    }

    /** 构建核心实体列表字符串 */
    private String buildCoreEntityList(List<KgEntity> entities) {
        return entities.stream()
                .limit(5)
                .map(e -> e.getEntityName() + "[" + translateType(e.getEntityType()) + "]")
                .collect(Collectors.joining("、"));
    }

    /** 构建推理路径建议 */
    private List<String> buildReasoningPaths(List<KgEntity> seedEntities, List<GraphCommunity> communities) {
        List<String> paths = new ArrayList<>();
        if (seedEntities.isEmpty() || communities.isEmpty()) return paths;

        // 基于社区中的实体类型，给出推理路径建议
        Set<String> allTypes = new HashSet<>();
        for (GraphCommunity community : communities) {
            // 从摘要和核心实体中提取类型信息
            for (KgEntity seed : seedEntities) {
                allTypes.add(seed.getEntityType());
            }
        }

        // 常见推理模式
        if (allTypes.contains("ORDER") && allTypes.contains("FACTORY")) {
            paths.add("订单 → 生产工厂 → 产能分析 → 交期预测");
        }
        if (allTypes.contains("STYLE") && allTypes.contains("MATERIAL")) {
            paths.add("款式 → BOM材料 → 供应商 → 采购周期");
        }
        if (allTypes.contains("ORDER") && allTypes.contains("PROCESS")) {
            paths.add("订单 → 工序流程 → 瓶颈工序 → 进度跟踪");
        }

        return paths;
    }

    /**
     * 图社区数据结构（GraphRAG 的基本单元）
     */
    @lombok.Data
    private static class GraphCommunity {
        private String summary;          // 社区摘要
        private String coreEntities;     // 核心实体列表
        private List<String> keyRelations;  // 关键关系
        private int entityCount;         // 实体数量
    }
}