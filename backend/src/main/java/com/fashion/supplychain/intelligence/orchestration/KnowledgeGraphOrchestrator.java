package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.KgEntity;
import com.fashion.supplychain.intelligence.entity.KgRelation;
import com.fashion.supplychain.intelligence.entity.KgSynonym;
import com.fashion.supplychain.intelligence.mapper.KgEntityMapper;
import com.fashion.supplychain.intelligence.mapper.KgRelationMapper;
import com.fashion.supplychain.intelligence.mapper.KgSynonymMapper;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import com.fashion.supplychain.style.mapper.StyleProcessMapper;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.mapper.FactoryMapper;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class KnowledgeGraphOrchestrator {

    private static final String REL_PROCESS_DEPENDS_ON = "PROCESS_DEPENDS_ON";
    private static final String REL_SUPPLIER_SUPPLIES = "SUPPLIER_SUPPLIES";
    private static final String REL_ORDER_BELONGS_TO_FACTORY = "ORDER_BELONGS_TO_FACTORY";
    private static final String REL_STYLE_CONTAINS_PROCESS = "STYLE_CONTAINS_PROCESS";
    private static final String REL_MATERIAL_USED_IN_STYLE = "MATERIAL_USED_IN_STYLE";
    private static final String REL_FACTORY_SPECIALIZES_IN = "FACTORY_SPECIALIZES_IN";
    private static final String REL_CUSTOMER_RELATED_STYLE = "CUSTOMER_RELATED_STYLE";
    private static final String REL_ORDER_RELATED_STYLE = "ORDER_RELATED_STYLE";

    private static final List<List<String>> SYNONYM_GROUPS = List.of(
            List.of("超期", "延期", "逾期", "overdue"),
            List.of("面料", "面辅料", "布料"),
            List.of("工厂", "加工厂", "外发厂"),
            List.of("款式", "样衣", "板衣"),
            List.of("进度", "生产进度", "完成率"),
            List.of("质检", "品检", "检验")
    );

    private static final Map<String, List<String>> SYNONYM_EXPANSION = buildSynonymExpansion();

    private static Map<String, List<String>> buildSynonymExpansion() {
        Map<String, List<String>> map = new HashMap<>();
        for (List<String> group : SYNONYM_GROUPS) {
            for (String word : group) {
                map.put(word, group);
            }
        }
        return map;
    }

    private final KgEntityMapper entityMapper;
    private final KgRelationMapper relationMapper;
    private final KgSynonymMapper synonymMapper;
    private final ProductionOrderMapper productionOrderMapper;
    private final StyleInfoMapper styleInfoMapper;
    private final StyleProcessMapper styleProcessMapper;
    private final FactoryMapper factoryMapper;
    private final MaterialPurchaseMapper materialPurchaseMapper;

    @Data
    public static class ReasoningPath {
        private List<String> entityNames = new ArrayList<>();
        private List<String> relationTypes = new ArrayList<>();
        private String pathDescription;
        private double confidence;
    }

    @Data
    private static class BuildContext {
        private Long tenantId;
        private int entityCount;
        private int relationCount;
        private Map<String, KgEntity> factoryEntityMap = new LinkedHashMap<>();
        private Map<Long, KgEntity> styleEntityMap = new LinkedHashMap<>();
        private Map<String, KgEntity> processEntityMap = new LinkedHashMap<>();
        private Map<String, KgEntity> orderEntityMap = new LinkedHashMap<>();
        private Map<String, KgEntity> supplierEntityMap = new LinkedHashMap<>();
        private Map<String, KgEntity> materialEntityMap = new LinkedHashMap<>();
        private Map<String, KgEntity> customerEntityMap = new LinkedHashMap<>();
        private List<Factory> factories;
        private List<StyleProcess> styleProcesses;
        private List<ProductionOrder> orders;
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
        List<String> searchTerms = new ArrayList<>();
        searchTerms.add(query);

        List<KgSynonym> synonyms = synonymMapper.selectList(
                new LambdaQueryWrapper<KgSynonym>()
                        .eq(KgSynonym::getTenantId, tenantId)
                        .eq(KgSynonym::getWord, query));
        for (KgSynonym syn : synonyms) {
            searchTerms.add(syn.getCanonicalEntity());
        }

        if (SYNONYM_EXPANSION.containsKey(query)) {
            searchTerms.addAll(SYNONYM_EXPANSION.get(query));
        }

        List<KgEntity> results = new ArrayList<>();
        for (String term : searchTerms) {
            List<KgEntity> found = entityMapper.selectList(
                    new LambdaQueryWrapper<KgEntity>()
                            .eq(KgEntity::getDeleteFlag, 0)
                            .and(w -> w.isNull(KgEntity::getTenantId).or().eq(KgEntity::getTenantId, tenantId))
                            .and(w -> w.like(KgEntity::getEntityName, term)
                                    .or().like(KgEntity::getEntityType, term)
                                    .or().like(KgEntity::getPropertiesJson, term))
                            .last("LIMIT 10"));
            results.addAll(found);
        }

        Map<Long, KgEntity> deduped = new LinkedHashMap<>();
        for (KgEntity e : results) {
            deduped.putIfAbsent(e.getId(), e);
        }
        return new ArrayList<>(deduped.values()).subList(0, Math.min(10, deduped.size()));
    }

    public void addSynonym(Long tenantId, String word, String canonicalEntity, String entityType) {
        KgSynonym existing = synonymMapper.selectOne(
                new LambdaQueryWrapper<KgSynonym>()
                        .eq(KgSynonym::getTenantId, tenantId)
                        .eq(KgSynonym::getWord, word));
        if (existing != null) {
            existing.setCanonicalEntity(canonicalEntity);
            existing.setEntityType(entityType);
            synonymMapper.updateById(existing);
            return;
        }
        KgSynonym syn = new KgSynonym();
        syn.setTenantId(tenantId);
        syn.setWord(word);
        syn.setCanonicalEntity(canonicalEntity);
        syn.setEntityType(entityType);
        synonymMapper.insert(syn);
    }

    public List<KgSynonym> listSynonyms(Long tenantId, String entityType) {
        LambdaQueryWrapper<KgSynonym> wrapper = new LambdaQueryWrapper<KgSynonym>()
                .eq(KgSynonym::getTenantId, tenantId);
        if (entityType != null) {
            wrapper.eq(KgSynonym::getEntityType, entityType);
        }
        return synonymMapper.selectList(wrapper);
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
            BuildContext bc = new BuildContext();
            bc.tenantId = tenantId;
            buildFactoryEntities(bc);
            buildStyleEntities(bc);
            buildProcessEntities(bc);
            buildOrderEntities(bc);
            buildStyleProcessRelations(bc);
            buildProcessDependencyRelations(bc);
            buildSupplierMaterialRelations(bc);
            buildFactorySpecializationRelations(bc);
            buildCustomerStyleRelations(bc);
            seedSynonyms(tenantId);
            log.info("[KnowledgeGraph] Graph built for tenant {}: {} entities, {} relations",
                    tenantId, bc.entityCount, bc.relationCount);
        } catch (Exception e) {
            log.warn("[KnowledgeGraph] buildGraphFromBusinessData failed: {}", e.getMessage());
        } finally {
            UserContext.clear();
        }
    }

    private void buildFactoryEntities(BuildContext bc) {
        bc.factories = factoryMapper.selectList(
                new LambdaQueryWrapper<Factory>()
                        .eq(Factory::getTenantId, bc.tenantId)
                        .eq(Factory::getDeleteFlag, 0)
                        .last("LIMIT 500"));
        for (Factory f : bc.factories) {
            String props = String.format("{\"type\":\"%s\",\"supplierType\":\"%s\",\"category\":\"%s\"}",
                    f.getFactoryType(), f.getSupplierType(), f.getSupplierCategory());
            KgEntity e = upsertEntity(bc.tenantId, "factory", f.getFactoryName(), f.getId(), props);
            bc.factoryEntityMap.put(f.getId(), e);
            bc.entityCount++;
        }
    }

    private void buildStyleEntities(BuildContext bc) {
        List<StyleInfo> styles = styleInfoMapper.selectList(
                new LambdaQueryWrapper<StyleInfo>()
                        .eq(StyleInfo::getTenantId, bc.tenantId)
                        .last("LIMIT 1000"));
        for (StyleInfo s : styles) {
            String props = String.format("{\"category\":\"%s\",\"season\":\"%s\",\"customer\":\"%s\"}",
                    s.getCategory(), s.getSeason(), s.getCustomer());
            KgEntity e = upsertEntity(bc.tenantId, "style", s.getStyleNo() + "-" + s.getStyleName(),
                    String.valueOf(s.getId()), props);
            bc.styleEntityMap.put(s.getId(), e);
            bc.entityCount++;
        }
    }

    private void buildProcessEntities(BuildContext bc) {
        bc.styleProcesses = styleProcessMapper.selectList(
                new LambdaQueryWrapper<StyleProcess>()
                        .eq(StyleProcess::getTenantId, bc.tenantId)
                        .last("LIMIT 2000"));
        for (StyleProcess sp : bc.styleProcesses) {
            String props = String.format("{\"stage\":\"%s\",\"difficulty\":\"%s\",\"price\":%s}",
                    sp.getProgressStage(), sp.getDifficulty(),
                    sp.getPrice() != null ? sp.getPrice().toPlainString() : "0");
            KgEntity e = upsertEntity(bc.tenantId, "process", sp.getProcessName(),
                    sp.getId(), props);
            bc.processEntityMap.put(sp.getId(), e);
            bc.entityCount++;
        }
    }

    private void buildOrderEntities(BuildContext bc) {
        bc.orders = productionOrderMapper.selectList(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getTenantId, bc.tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .last("LIMIT 200"));
        for (ProductionOrder o : bc.orders) {
            String props = String.format("{\"status\":\"%s\",\"quantity\":%s,\"urgency\":\"%s\"}",
                    o.getStatus(),
                    o.getOrderQuantity() != null ? o.getOrderQuantity() : 0,
                    o.getUrgencyLevel());
            KgEntity e = upsertEntity(bc.tenantId, "order", o.getOrderNo(), o.getId(), props);
            bc.orderEntityMap.put(o.getId(), e);
            bc.entityCount++;
            buildOrderRelations(bc, o, e);
        }
    }

    private void buildOrderRelations(BuildContext bc, ProductionOrder o, KgEntity orderEntity) {
        if (o.getFactoryId() != null && bc.factoryEntityMap.containsKey(o.getFactoryId())) {
            KgEntity factoryEntity = bc.factoryEntityMap.get(o.getFactoryId());
            upsertRelation(bc.tenantId, orderEntity.getId(), factoryEntity.getId(),
                    REL_ORDER_BELONGS_TO_FACTORY, 1.0);
            bc.relationCount++;
        }
        if (o.getStyleId() != null) {
            try {
                Long styleId = Long.parseLong(o.getStyleId());
                KgEntity styleEntity = bc.styleEntityMap.get(styleId);
                if (styleEntity != null) {
                    upsertRelation(bc.tenantId, orderEntity.getId(), styleEntity.getId(),
                            REL_ORDER_RELATED_STYLE, 1.0);
                    bc.relationCount++;
                }
            } catch (NumberFormatException ex) {
                log.debug("[KnowledgeGraph] styleId非数字格式: {}", o.getStyleId());
            }
        }
    }

    private void buildStyleProcessRelations(BuildContext bc) {
        for (StyleProcess sp : bc.styleProcesses) {
            if (sp.getStyleId() != null && bc.styleEntityMap.containsKey(sp.getStyleId())
                    && bc.processEntityMap.containsKey(sp.getId())) {
                KgEntity styleEntity = bc.styleEntityMap.get(sp.getStyleId());
                KgEntity processEntity = bc.processEntityMap.get(sp.getId());
                upsertRelation(bc.tenantId, styleEntity.getId(), processEntity.getId(),
                        REL_STYLE_CONTAINS_PROCESS, 1.0);
                bc.relationCount++;
            }
        }
    }

    private void buildProcessDependencyRelations(BuildContext bc) {
        Map<Long, List<StyleProcess>> processesByStyle = bc.styleProcesses.stream()
                .filter(sp -> sp.getStyleId() != null)
                .collect(Collectors.groupingBy(StyleProcess::getStyleId));

        for (Map.Entry<Long, List<StyleProcess>> entry : processesByStyle.entrySet()) {
            List<StyleProcess> sorted = entry.getValue().stream()
                    .sorted(Comparator.comparingInt(sp -> sp.getSortOrder() != null ? sp.getSortOrder() : 999))
                    .collect(Collectors.toList());

            for (int i = 1; i < sorted.size(); i++) {
                StyleProcess prev = sorted.get(i - 1);
                StyleProcess curr = sorted.get(i);
                KgEntity prevEntity = bc.processEntityMap.get(prev.getId());
                KgEntity currEntity = bc.processEntityMap.get(curr.getId());
                if (prevEntity != null && currEntity != null) {
                    upsertRelation(bc.tenantId, prevEntity.getId(), currEntity.getId(),
                            REL_PROCESS_DEPENDS_ON, 0.8);
                    bc.relationCount++;
                }
            }
        }
    }

    private void buildSupplierMaterialRelations(BuildContext bc) {
        List<MaterialPurchase> purchases = materialPurchaseMapper.selectList(
                new LambdaQueryWrapper<MaterialPurchase>()
                        .eq(MaterialPurchase::getTenantId, bc.tenantId)
                        .eq(MaterialPurchase::getDeleteFlag, 0)
                        .last("LIMIT 200"));
        for (MaterialPurchase mp : purchases) {
            if (mp.getSupplierName() != null && mp.getSupplierId() != null
                    && !bc.supplierEntityMap.containsKey(mp.getSupplierId())) {
                KgEntity e = upsertEntity(bc.tenantId, "supplier", mp.getSupplierName(),
                        mp.getSupplierId(), "{\"type\":\"material\"}");
                bc.supplierEntityMap.put(mp.getSupplierId(), e);
                bc.entityCount++;
            }
            if (mp.getSupplierId() == null || !bc.supplierEntityMap.containsKey(mp.getSupplierId())) continue;
            KgEntity supplierEntity = bc.supplierEntityMap.get(mp.getSupplierId());
            String materialName = mp.getMaterialName() != null ? mp.getMaterialName() : mp.getMaterialCode();
            KgEntity materialEntity = upsertEntity(bc.tenantId, "material", materialName,
                    mp.getMaterialId(), String.format("{\"type\":\"%s\"}", mp.getMaterialType()));
            bc.materialEntityMap.putIfAbsent(mp.getMaterialId(), materialEntity);
            upsertRelation(bc.tenantId, supplierEntity.getId(), materialEntity.getId(),
                    REL_SUPPLIER_SUPPLIES, 1.0);
            bc.entityCount++;
            bc.relationCount++;
            if (mp.getStyleId() != null) {
                linkMaterialToStyle(bc, mp.getStyleId(), materialEntity);
            }
        }
    }

    private void linkMaterialToStyle(BuildContext bc, String styleIdStr, KgEntity materialEntity) {
        try {
            Long styleId = Long.parseLong(styleIdStr);
            KgEntity styleEntity = bc.styleEntityMap.get(styleId);
            if (styleEntity != null) {
                upsertRelation(bc.tenantId, materialEntity.getId(), styleEntity.getId(),
                        REL_MATERIAL_USED_IN_STYLE, 0.9);
                bc.relationCount++;
            }
        } catch (NumberFormatException ignored) {}
    }

    private void buildFactorySpecializationRelations(BuildContext bc) {
        Map<String, Set<String>> factoryStages = new HashMap<>();
        Map<Long, List<StyleProcess>> procsByStyle = bc.styleProcesses.stream()
                .filter(sp -> sp.getStyleId() != null && sp.getProgressStage() != null)
                .collect(Collectors.groupingBy(StyleProcess::getStyleId));

        for (ProductionOrder o : bc.orders) {
            if (o.getFactoryId() == null || o.getStyleId() == null) continue;
            try {
                Long styleId = Long.parseLong(o.getStyleId());
                for (StyleProcess sp : procsByStyle.getOrDefault(styleId, Collections.emptyList())) {
                    factoryStages.computeIfAbsent(o.getFactoryId(), k -> new HashSet<>())
                            .add(sp.getProgressStage());
                }
            } catch (NumberFormatException ignored) {}
        }

        Map<String, KgEntity> stageCache = new HashMap<>();
        for (Map.Entry<String, Set<String>> entry : factoryStages.entrySet()) {
            KgEntity factoryEntity = bc.factoryEntityMap.get(entry.getKey());
            if (factoryEntity == null) continue;
            for (String stage : entry.getValue()) {
                KgEntity stageEntity = stageCache.computeIfAbsent(stage,
                        s -> upsertEntity(bc.tenantId, "process_stage", s, "stage-" + s, "{\"level\":\"parent\"}"));
                upsertRelation(bc.tenantId, factoryEntity.getId(), stageEntity.getId(),
                        REL_FACTORY_SPECIALIZES_IN, 0.7);
                bc.relationCount++;
            }
        }
    }

    private void buildCustomerStyleRelations(BuildContext bc) {
        for (ProductionOrder o : bc.orders) {
            if (o.getCustomerId() == null || o.getStyleId() == null) continue;
            KgEntity customerEntity = bc.customerEntityMap.computeIfAbsent(o.getCustomerId(), id -> {
                String name = o.getCustomerName() != null ? o.getCustomerName() : id;
                KgEntity e = upsertEntity(bc.tenantId, "customer", name, id, "{}");
                bc.entityCount++;
                return e;
            });
            try {
                Long styleId = Long.parseLong(o.getStyleId());
                KgEntity styleEntity = bc.styleEntityMap.get(styleId);
                if (styleEntity != null) {
                    upsertRelation(bc.tenantId, customerEntity.getId(), styleEntity.getId(),
                            REL_CUSTOMER_RELATED_STYLE, 0.9);
                    bc.relationCount++;
                }
            } catch (NumberFormatException ignored) {}
        }
    }

    private void seedSynonyms(Long tenantId) {
        for (List<String> group : SYNONYM_GROUPS) {
            String canonical = group.get(0);
            for (String word : group) {
                addSynonym(tenantId, word, canonical, "business_term");
            }
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
