package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.KgEntity;
import com.fashion.supplychain.intelligence.entity.KgRelation;
import com.fashion.supplychain.intelligence.entity.KgSynonym;
import com.fashion.supplychain.intelligence.mapper.KgEntityMapper;
import com.fashion.supplychain.intelligence.mapper.KgRelationMapper;
import com.fashion.supplychain.intelligence.mapper.KgSynonymMapper;
import com.fashion.supplychain.production.entity.*;
import com.fashion.supplychain.production.mapper.*;
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

    private final KgEntityMapper entityMapper;
    private final KgRelationMapper relationMapper;
    private final KgSynonymMapper synonymMapper;
    private final ProductionOrderMapper productionOrderMapper;
    private final StyleInfoMapper styleInfoMapper;
    private final StyleProcessMapper styleProcessMapper;
    private final FactoryMapper factoryMapper;
    private final MaterialPurchaseMapper materialPurchaseMapper;
    private final FactoryShipmentMapper factoryShipmentMapper;
    private final ScanRecordMapper scanRecordMapper;
    private final ProductWarehousingMapper productWarehousingMapper;

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
        List<String> searchTerms = new ArrayList<>();
        searchTerms.add(query);

        List<KgSynonym> synonyms = synonymMapper.selectList(
                new LambdaQueryWrapper<KgSynonym>()
                        .eq(KgSynonym::getTenantId, tenantId)
                        .eq(KgSynonym::getWord, query));
        for (KgSynonym syn : synonyms) {
            searchTerms.add(syn.getCanonicalEntity());
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
            int entityCount = 0;
            int relationCount = 0;

            List<Factory> factories = factoryMapper.selectList(
                    new LambdaQueryWrapper<Factory>()
                            .eq(Factory::getTenantId, tenantId)
                            .eq(Factory::getDeleteFlag, 0)
                            .last("LIMIT 500"));
            Map<String, KgEntity> factoryEntityMap = new LinkedHashMap<>();
            for (Factory f : factories) {
                String props = String.format("{\"type\":\"%s\",\"supplierType\":\"%s\"}",
                        f.getFactoryType(), f.getSupplierType());
                KgEntity e = upsertEntity(tenantId, "factory", f.getFactoryName(), f.getId(), props);
                factoryEntityMap.put(f.getId(), e);
                entityCount++;
            }

            List<StyleInfo> styles = styleInfoMapper.selectList(
                    new LambdaQueryWrapper<StyleInfo>()
                            .eq(StyleInfo::getTenantId, tenantId)
                            .last("LIMIT 1000"));
            Map<Long, KgEntity> styleEntityMap = new LinkedHashMap<>();
            for (StyleInfo s : styles) {
                String props = String.format("{\"category\":\"%s\",\"season\":\"%s\"}",
                        s.getCategory(), s.getSeason());
                KgEntity e = upsertEntity(tenantId, "style", s.getStyleNo() + "-" + s.getStyleName(),
                        String.valueOf(s.getId()), props);
                styleEntityMap.put(s.getId(), e);
                entityCount++;
            }

            List<StyleProcess> styleProcesses = styleProcessMapper.selectList(
                    new LambdaQueryWrapper<StyleProcess>()
                            .eq(StyleProcess::getTenantId, tenantId)
                            .last("LIMIT 2000"));
            Map<String, KgEntity> processEntityMap = new LinkedHashMap<>();
            for (StyleProcess sp : styleProcesses) {
                String props = String.format("{\"stage\":\"%s\",\"difficulty\":\"%s\",\"price\":%s}",
                        sp.getProgressStage(), sp.getDifficulty(),
                        sp.getPrice() != null ? sp.getPrice().toPlainString() : "0");
                KgEntity e = upsertEntity(tenantId, "process", sp.getProcessName(),
                        sp.getId(), props);
                processEntityMap.put(sp.getId(), e);
                entityCount++;
            }

            List<ProductionOrder> orders = productionOrderMapper.selectList(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .eq(ProductionOrder::getTenantId, tenantId)
                            .eq(ProductionOrder::getDeleteFlag, 0)
                            .last("LIMIT 200"));
            Map<String, KgEntity> orderEntityMap = new LinkedHashMap<>();
            for (ProductionOrder o : orders) {
                String props = String.format("{\"status\":\"%s\",\"quantity\":%s,\"urgency\":\"%s\"}",
                        o.getStatus(),
                        o.getOrderQuantity() != null ? o.getOrderQuantity() : 0,
                        o.getUrgencyLevel());
                KgEntity e = upsertEntity(tenantId, "order", o.getOrderNo(), o.getId(), props);
                orderEntityMap.put(o.getId(), e);
                entityCount++;

                if (o.getFactoryId() != null && factoryEntityMap.containsKey(o.getFactoryId())) {
                    KgEntity factoryEntity = factoryEntityMap.get(o.getFactoryId());
                    upsertRelation(tenantId, factoryEntity.getId(), e.getId(), "produces", 1.0);
                    relationCount++;
                }

                if (o.getStyleId() != null) {
                    try {
                        Long styleId = Long.parseLong(o.getStyleId());
                        if (styleEntityMap.containsKey(styleId)) {
                            KgEntity styleEntity = styleEntityMap.get(styleId);
                            upsertRelation(tenantId, e.getId(), styleEntity.getId(), "contains", 1.0);
                            relationCount++;
                        }
                    } catch (NumberFormatException ex) {
                        log.debug("[KnowledgeGraph] styleId非数字格式: {}", o.getStyleId());
                    }
                }
            }

            for (StyleProcess sp : styleProcesses) {
                if (sp.getStyleId() != null && styleEntityMap.containsKey(sp.getStyleId())
                        && processEntityMap.containsKey(sp.getId())) {
                    KgEntity styleEntity = styleEntityMap.get(sp.getStyleId());
                    KgEntity processEntity = processEntityMap.get(sp.getId());
                    upsertRelation(tenantId, styleEntity.getId(), processEntity.getId(), "requires", 1.0);
                    relationCount++;
                }
            }

            buildProcessDependencyRelations(tenantId, styleProcesses, processEntityMap);

            List<MaterialPurchase> purchases = materialPurchaseMapper.selectList(
                    new LambdaQueryWrapper<MaterialPurchase>()
                            .eq(MaterialPurchase::getTenantId, tenantId)
                            .eq(MaterialPurchase::getDeleteFlag, 0)
                            .last("LIMIT 200"));
            Map<String, KgEntity> supplierEntityMap = new LinkedHashMap<>();
            for (MaterialPurchase mp : purchases) {
                if (mp.getSupplierName() != null && !supplierEntityMap.containsKey(mp.getSupplierId())) {
                    KgEntity e = upsertEntity(tenantId, "supplier", mp.getSupplierName(),
                            mp.getSupplierId(), "{\"type\":\"material\"}");
                    supplierEntityMap.put(mp.getSupplierId(), e);
                    entityCount++;
                }
                if (mp.getSupplierId() != null && supplierEntityMap.containsKey(mp.getSupplierId())) {
                    KgEntity supplierEntity = supplierEntityMap.get(mp.getSupplierId());
                    String materialName = mp.getMaterialName() != null ? mp.getMaterialName() : mp.getMaterialCode();
                    KgEntity materialEntity = upsertEntity(tenantId, "material", materialName,
                            mp.getMaterialId(), String.format("{\"type\":\"%s\"}", mp.getMaterialType()));
                    upsertRelation(tenantId, supplierEntity.getId(), materialEntity.getId(), "supplies", 1.0);
                    entityCount++;
                    relationCount++;
                }
            }

            List<FactoryShipment> shipments = factoryShipmentMapper.selectList(
                    new LambdaQueryWrapper<FactoryShipment>()
                            .eq(FactoryShipment::getTenantId, tenantId)
                            .eq(FactoryShipment::getDeleteFlag, 0)
                            .last("LIMIT 200"));
            for (FactoryShipment fs : shipments) {
                if (fs.getFactoryId() != null && factoryEntityMap.containsKey(fs.getFactoryId())) {
                    KgEntity factoryEntity = factoryEntityMap.get(fs.getFactoryId());
                    KgEntity shipmentEntity = upsertEntity(tenantId, "shipment",
                            fs.getShipmentNo(), fs.getId(),
                            String.format("{\"quantity\":%s,\"status\":\"%s\"}",
                                    fs.getShipQuantity() != null ? fs.getShipQuantity() : 0,
                                    fs.getReceiveStatus()));
                    upsertRelation(tenantId, factoryEntity.getId(), shipmentEntity.getId(), "delivers", 1.0);
                    entityCount++;
                    relationCount++;
                }
            }

            List<ScanRecord> scans = scanRecordMapper.selectList(
                    new LambdaQueryWrapper<ScanRecord>()
                            .eq(ScanRecord::getTenantId, tenantId)
                            .eq(ScanRecord::getScanResult, "success")
                            .eq(ScanRecord::getScanType, "quality")
                            .ne(ScanRecord::getScanType, "orchestration")
                            .last("LIMIT 200"));
            for (ScanRecord sr : scans) {
                if (sr.getOperatorName() != null) {
                    KgEntity workerEntity = upsertEntity(tenantId, "worker",
                            sr.getOperatorName(), sr.getOperatorId(), "{}");
                    KgEntity qualityEntity = upsertEntity(tenantId, "quality_event",
                            "质检-" + sr.getOrderNo(), String.valueOf(sr.getId()),
                            String.format("{\"process\":\"%s\"}", sr.getProcessName()));
                    upsertRelation(tenantId, workerEntity.getId(), qualityEntity.getId(), "inspects", 1.0);
                    entityCount++;
                    relationCount++;
                }
            }

            log.info("[KnowledgeGraph] Graph building completed for tenant {}: {} entities, {} relations",
                    tenantId, entityCount, relationCount);
        } catch (Exception e) {
            log.warn("[KnowledgeGraph] buildGraphFromBusinessData failed: {}", e.getMessage());
        } finally {
            UserContext.clear();
        }
    }

    private void buildProcessDependencyRelations(Long tenantId, List<StyleProcess> styleProcesses,
                                                  Map<String, KgEntity> processEntityMap) {
        Map<Long, List<StyleProcess>> processesByStyle = styleProcesses.stream()
                .filter(sp -> sp.getStyleId() != null)
                .collect(Collectors.groupingBy(StyleProcess::getStyleId));

        for (Map.Entry<Long, List<StyleProcess>> entry : processesByStyle.entrySet()) {
            List<StyleProcess> sorted = entry.getValue().stream()
                    .sorted(Comparator.comparingInt(sp -> sp.getSortOrder() != null ? sp.getSortOrder() : 999))
                    .collect(Collectors.toList());

            for (int i = 1; i < sorted.size(); i++) {
                StyleProcess prev = sorted.get(i - 1);
                StyleProcess curr = sorted.get(i);
                KgEntity prevEntity = processEntityMap.get(prev.getId());
                KgEntity currEntity = processEntityMap.get(curr.getId());
                if (prevEntity != null && currEntity != null) {
                    upsertRelation(tenantId, prevEntity.getId(), currEntity.getId(), "depends_on", 0.8);
                }
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
