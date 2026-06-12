package com.fashion.supplychain.intelligence.engine.risk;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Slf4j
@Component
@Lazy
@RequiredArgsConstructor
public class ParallelRiskDetector {

    private final List<RiskDetector> detectors;

    @Autowired(required = false)
    private RiskRuleConfigService ruleConfig;

    private final ExecutorService executor = Executors.newFixedThreadPool(
            Math.min(7, Math.max(2, Runtime.getRuntime().availableProcessors())),
            r -> {
                Thread t = new Thread(r, "risk-detector");
                t.setDaemon(true);
                return t;
            });

    public Map<RiskType, List<RiskItem>> detectAll(Long tenantId) {
        if (tenantId == null) return new EnumMap<>(RiskType.class);

        Map<RiskType, List<RiskItem>> result = new EnumMap<>(RiskType.class);
        for (RiskType t : RiskType.values()) result.put(t, new ArrayList<>());

        List<CompletableFuture<Void>> futures = new ArrayList<>();
        for (RiskDetector detector : detectors) {
            final RiskType type = detector.getType();
            CompletableFuture<Void> future = CompletableFuture.runAsync(() -> {
                List<RiskItem> items = safeDetect(detector, tenantId, type);
                if (ruleConfig != null) {
                    items = items.stream()
                            .filter(ruleConfig::isAboveThreshold)
                            .toList();
                }
                synchronized (result) {
                    result.get(type).addAll(items);
                }
            }, executor);
            futures.add(future);
        }
        for (CompletableFuture<Void> f : futures) {
            try { f.join(); } catch (Exception e) { log.warn("[Risk] future failed: {}", e.getMessage()); }
        }
        return result;
    }

    public List<RiskItem> detectByType(Long tenantId, RiskType type) {
        if (tenantId == null || type == null) return List.of();
        return detectors.stream()
                .filter(d -> d.getType() == type)
                .findFirst()
                .map(d -> safeDetect(d, tenantId, type))
                .map(items -> ruleConfig == null ? items :
                        items.stream().filter(ruleConfig::isAboveThreshold).toList())
                .orElse(List.of());
    }

    public List<RiskItem> mergeAndRank(Map<RiskType, List<RiskItem>> byType) {
        List<RiskItem> all = new ArrayList<>();
        for (List<RiskItem> list : byType.values()) all.addAll(list);
        all.sort((a, b) -> Double.compare(
                weightedScore(b.getScore(), b.getType()),
                weightedScore(a.getScore(), a.getType())));
        return all;
    }

    public List<RiskItem> deduplicate(List<RiskItem> items) {
        Map<String, RiskItem> byKey = new java.util.HashMap<>();
        for (RiskItem item : items) {
            String key = (item.getOrderId() != null ? item.getOrderId() : "factory:" + item.getFactoryId())
                    + "|" + item.getType();
            RiskItem existing = byKey.get(key);
            if (existing == null || item.getScore() > existing.getScore()) {
                byKey.put(key, item);
            }
        }
        return new ArrayList<>(byKey.values());
    }

    private double weightedScore(double score, RiskType type) {
        if (ruleConfig != null) {
            Map<RiskType, Double> weights = ruleConfig.getAllTypeWeights();
            Double w = weights.get(type);
            if (w != null) return score * w;
        }
        return score * type.defaultWeight();
    }

    private List<RiskItem> safeDetect(RiskDetector detector, Long tenantId, RiskType type) {
        try {
            return detector.detect(tenantId);
        } catch (Exception e) {
            log.warn("[Risk] detector {} failed: {}", type, e.getMessage());
            return new ArrayList<>();
        }
    }

    public int totalDetectorCount() {
        return detectors.size();
    }
}
