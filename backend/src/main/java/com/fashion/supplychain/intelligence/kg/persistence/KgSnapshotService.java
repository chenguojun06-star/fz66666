package com.fashion.supplychain.intelligence.kg.persistence;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.intelligence.entity.KgSnapshotEntity;
import com.fashion.supplychain.intelligence.engine.kg.KgRelation;
import com.fashion.supplychain.intelligence.engine.kg.RelationExtractorRegistry;
import com.fashion.supplychain.intelligence.engine.kg.RelationType;
import com.fashion.supplychain.intelligence.mapper.KgSnapshotMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class KgSnapshotService {

    private final KgSnapshotMapper kgSnapshotMapper;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired(required = false)
    RelationExtractorRegistry relationExtractorRegistry;

    public String buildAndSaveSnapshot(Long tenantId) {
        if (tenantId == null) return null;
        if (relationExtractorRegistry == null) {
            log.debug("[KgSnapshot] registry not available, skip");
            return null;
        }
        long start = System.currentTimeMillis();
        String version = "v" + LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        Map<RelationType, List<KgRelation>> graph;
        try {
            graph = relationExtractorRegistry.extractAll(tenantId);
        } catch (Exception e) {
            log.warn("[KgSnapshot] extract failed tenant={}: {}", tenantId, e.getMessage());
            return null;
        }
        int total = 0;
        for (List<KgRelation> list : graph.values()) total += list.size();
        int duration = (int) (System.currentTimeMillis() - start);

        for (Map.Entry<RelationType, List<KgRelation>> entry : graph.entrySet()) {
            try {
                KgSnapshotEntity e = new KgSnapshotEntity();
                e.setTenantId(tenantId);
                e.setSnapshotVersion(version);
                e.setRelationType(entry.getKey().name());
                e.setRelationCount(entry.getValue().size());
                e.setPayload(objectMapper.writeValueAsString(entry.getValue()));
                e.setPayloadSize(e.getPayload() == null ? 0 : e.getPayload().length());
                e.setBuildSource("full");
                e.setBuildDurationMs(duration);
                e.setCreateTime(LocalDateTime.now());
                kgSnapshotMapper.insert(e);
            } catch (JsonProcessingException ex) {
                log.warn("[KgSnapshot] serialize failed type={}: {}", entry.getKey(), ex.getMessage());
            } catch (Exception ex) {
                log.warn("[KgSnapshot] save failed type={}: {}", entry.getKey(), ex.getMessage());
            }
        }
        log.info("[KgSnapshot] built tenant={} version={} total={} durationMs={}",
                tenantId, version, total, duration);
        return version;
    }

    public KgSnapshotEntity findLatest(Long tenantId, String relationType) {
        if (tenantId == null) return null;
        try {
            return kgSnapshotMapper.findLatest(tenantId, relationType, 0);
        } catch (Exception e) {
            log.debug("[KgSnapshot] findLatest failed: {}", e.getMessage());
            return null;
        }
    }

    public List<KgRelation> loadLatestRelations(Long tenantId, RelationType type) {
        KgSnapshotEntity entity = findLatest(tenantId, type.name());
        if (entity == null || entity.getPayload() == null || entity.getPayload().isBlank()) {
            return new ArrayList<>();
        }
        try {
            KgRelation[] arr = objectMapper.readValue(entity.getPayload(), KgRelation[].class);
            List<KgRelation> list = new ArrayList<>();
            for (KgRelation r : arr) list.add(r);
            return list;
        } catch (Exception e) {
            log.debug("[KgSnapshot] parse payload failed: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    public Map<RelationType, List<KgRelation>> loadLatestGraph(Long tenantId) {
        Map<RelationType, List<KgRelation>> result = new EnumMap<>(RelationType.class);
        if (tenantId == null) return result;
        try {
            List<KgSnapshotEntity> records = kgSnapshotMapper.findRecentByTenant(tenantId);
            for (KgSnapshotEntity rec : records) {
                try {
                    RelationType t = RelationType.valueOf(rec.getRelationType());
                    if (result.containsKey(t)) continue;
                    KgRelation[] arr = objectMapper.readValue(rec.getPayload(), KgRelation[].class);
                    List<KgRelation> list = new ArrayList<>();
                    for (KgRelation r : arr) list.add(r);
                    result.put(t, list);
                } catch (Exception ex) {
                    log.debug("[KgSnapshot] load entry failed type={}", rec.getRelationType());
                }
            }
        } catch (Exception e) {
            log.debug("[KgSnapshot] loadLatestGraph failed: {}", e.getMessage());
        }
        return result;
    }
}
