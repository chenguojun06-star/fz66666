package com.fashion.supplychain.intelligence.engine.kg;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Slf4j
@Component
@RequiredArgsConstructor
public class RelationExtractorRegistry {

    private final List<RelationExtractor> extractors;
    private final ExecutorService executor = Executors.newFixedThreadPool(
            Math.min(8, Math.max(2, Runtime.getRuntime().availableProcessors())),
            r -> {
                Thread t = new Thread(r, "kg-rel-extractor");
                t.setDaemon(true);
                return t;
            });

    public Map<RelationType, List<KgRelation>> extractAll(Long tenantId) {
        if (tenantId == null) return new EnumMap<>(RelationType.class);

        Map<RelationType, List<KgRelation>> result = new EnumMap<>(RelationType.class);
        for (RelationType t : RelationType.values()) {
            result.put(t, new ArrayList<>());
        }

        List<CompletableFuture<Void>> futures = new ArrayList<>();
        for (RelationExtractor ext : extractors) {
            final RelationType type = ext.getRelationType();
            CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                List<KgRelation> rels = doExtract(ext, tenantId, type);
                synchronized (result) {
                    result.get(type).addAll(rels);
                }
            }, executor);
            futures.add(future);
        }

        for (CompletableFuture<Void> f : futures) {
            try {
                f.join();
            } catch (Exception e) {
                log.warn("[KG] extractor future failed: {}", e.getMessage());
            }
        }
        return result;
    }

    public List<KgRelation> extractByType(Long tenantId, RelationType type) {
        if (tenantId == null || type == null) return List.of();
        return extractors.stream()
                .filter(e -> e.getRelationType() == type)
                .findFirst()
                .map(e -> doExtract(e, tenantId, type))
                .orElse(List.of());
    }

    public Map<RelationType, List<KgRelation>> extractByRelationTypes(Long tenantId, List<RelationType> types) {
        if (tenantId == null || types == null || types.isEmpty()) {
            return new EnumMap<>(RelationType.class);
        }

        Map<RelationType, List<KgRelation>> result = new EnumMap<>(RelationType.class);
        for (RelationType t : types) {
            result.put(t, new ArrayList<>());
        }

        List<RelationExtractor> matched = new ArrayList<>();
        for (RelationType t : types) {
            extractors.stream()
                    .filter(e -> e.getRelationType() == t)
                    .findFirst()
                    .ifPresent(matched::add);
        }

        List<CompletableFuture<Void>> futures = new ArrayList<>();
        for (RelationExtractor ext : matched) {
            final RelationType type = ext.getRelationType();
            CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                List<KgRelation> rels = doExtract(ext, tenantId, type);
                synchronized (result) {
                    result.get(type).addAll(rels);
                }
            }, executor);
            futures.add(future);
        }
        for (CompletableFuture<Void> f : futures) {
            try {
                f.join();
            } catch (Exception e) {
                log.warn("[KG] extractByRelationTypes future failed: {}", e.getMessage());
            }
        }
        return result;
    }

    private List<KgRelation> doExtract(RelationExtractor ext, Long tenantId, RelationType type) {
        try {
            return ext.extract(tenantId);
        } catch (Exception e) {
            log.warn("[KG] extractor {} failed: {}", type, e.getMessage());
            return new ArrayList<>();
        }
    }

    public int totalExtractorCount() {
        return extractors.size();
    }

    public Map<RelationType, Boolean> coverage() {
        Map<RelationType, Boolean> map = new EnumMap<>(RelationType.class);
        for (RelationType t : RelationType.values()) map.put(t, false);
        for (RelationExtractor ext : extractors) {
            map.put(ext.getRelationType(), true);
        }
        return map;
    }
}
