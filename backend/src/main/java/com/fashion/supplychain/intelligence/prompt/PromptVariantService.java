package com.fashion.supplychain.intelligence.prompt;

import com.fashion.supplychain.intelligence.service.SelfCriticService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

@Slf4j
@Service
public class PromptVariantService {

    private static final int MIN_SAMPLES_FOR_PROMOTION = 10;
    private static final double MIN_AVG_SCORE_DIFF = 3.0;
    private static final int MAX_VARIANTS_PER_SEGMENT = 5;

    private final Map<String, List<PromptVariant>> segmentVariants = new ConcurrentHashMap<>();
    private final Map<String, String> activeVariantBySegment = new ConcurrentHashMap<>();

    public PromptVariant registerVariant(String segmentName, String content, double weight) {
        return registerVariant(segmentName, content, weight, null, null);
    }

    public synchronized PromptVariant registerVariant(String segmentName, String content, double weight,
                                                       String parentVariantId, String mutationReason) {
        List<PromptVariant> variants = segmentVariants.computeIfAbsent(segmentName, k -> new ArrayList<>());
        if (variants.size() >= MAX_VARIANTS_PER_SEGMENT) {
            PromptVariant worst = variants.stream()
                    .min(Comparator.comparingDouble(PromptVariant::averageScore))
                    .orElse(null);
            if (worst != null) variants.remove(worst);
        }
        String id = "V-" + segmentName + "-" + UUID.randomUUID().toString().substring(0, 8);
        PromptVariant v = new PromptVariant(id, segmentName, content, weight);
        v.setParentVariantId(parentVariantId);
        v.setMutationReason(mutationReason);
        variants.add(v);
        if (variants.size() == 1) {
            activeVariantBySegment.put(segmentName, v.getVariantId());
        }
        log.info("[PromptVariant] registered: segment={} id={} weight={}", segmentName, id, weight);
        return v;
    }

    public PromptVariant selectVariant(String segmentName) {
        List<PromptVariant> variants = segmentVariants.get(segmentName);
        if (variants == null || variants.isEmpty()) return null;
        if (variants.size() == 1) return variants.get(0);

        double totalWeight = variants.stream()
                .filter(v -> "ACTIVE".equals(v.getStatus()))
                .mapToDouble(PromptVariant::getWeight)
                .sum();
        if (totalWeight <= 0) return variants.get(0);

        double pick = ThreadLocalRandom.current().nextDouble() * totalWeight;
        double cum = 0.0;
        for (PromptVariant v : variants) {
            if (!"ACTIVE".equals(v.getStatus())) continue;
            cum += v.getWeight();
            if (pick <= cum) {
                activeVariantBySegment.put(segmentName, v.getVariantId());
                return v;
            }
        }
        return variants.get(0);
    }

    public PromptVariant getActiveVariant(String segmentName) {
        String activeId = activeVariantBySegment.get(segmentName);
        if (activeId == null) return null;
        List<PromptVariant> variants = segmentVariants.get(segmentName);
        if (variants == null) return null;
        return variants.stream()
                .filter(v -> v.getVariantId().equals(activeId))
                .findFirst()
                .orElse(null);
    }

    public void recordScore(String segmentName, String variantId, double score) {
        List<PromptVariant> variants = segmentVariants.get(segmentName);
        if (variants == null) return;
        variants.stream()
                .filter(v -> v.getVariantId().equals(variantId))
                .findFirst()
                .ifPresent(v -> v.recordScore(score));
    }

    public PromptVariant promoteBestVariant(String segmentName) {
        List<PromptVariant> variants = segmentVariants.get(segmentName);
        if (variants == null || variants.size() < 2) return null;

        List<PromptVariant> eligible = new java.util.ArrayList<>();
        for (PromptVariant v : variants) {
            if ("ACTIVE".equals(v.getStatus()) && v.hasMinimumSamples(MIN_SAMPLES_FOR_PROMOTION)) {
                eligible.add(v);
            }
        }
        if (eligible.size() < 2) return null;

        eligible.sort(Comparator.comparingDouble(PromptVariant::averageScore).reversed());
        PromptVariant best = eligible.get(0);
        PromptVariant second = eligible.get(1);

        if (best.averageScore() - second.averageScore() < MIN_AVG_SCORE_DIFF) {
            return null;
        }
        activeVariantBySegment.put(segmentName, best.getVariantId());
        log.info("[PromptVariant] promoted: segment={} from={} to={} avg={} vs {}",
                segmentName, second.getVariantId(), best.getVariantId(),
                best.averageScore(), second.averageScore());
        return best;
    }

    public List<Map<String, Object>> snapshot(String segmentName) {
        List<PromptVariant> variants = segmentVariants.get(segmentName);
        if (variants == null) return new ArrayList<>();
        List<Map<String, Object>> result = new ArrayList<>();
        String activeId = activeVariantBySegment.get(segmentName);
        for (PromptVariant v : variants) {
            Map<String, Object> map = new HashMap<>();
            map.put("variantId", v.getVariantId());
            map.put("weight", v.getWeight());
            map.put("avgScore", v.averageScore());
            map.put("exposures", v.totalExposures());
            map.put("samples", v.getScoreHistory() == null ? 0 : v.getScoreHistory().size());
            map.put("status", v.getStatus());
            map.put("isActive", v.getVariantId().equals(activeId));
            map.put("createdAt", v.getCreatedAt());
            result.add(map);
        }
        return result;
    }

    public List<PromptVariant> getAllVariants(String segmentName) {
        return segmentVariants.get(segmentName);
    }

    public int totalSegmentCount() {
        return segmentVariants.size();
    }

    public PromptVariant mutateVariant(String segmentName, String newContent, String mutationReason) {
        PromptVariant current = getActiveVariant(segmentName);
        if (current == null) return null;
        return registerVariant(segmentName, newContent, 0.3, current.getVariantId(), mutationReason);
    }

    public LocalDateTime lastEvolutionTime() {
        long max = 0;
        for (List<PromptVariant> list : segmentVariants.values()) {
            for (PromptVariant v : list) {
                if (v.getLastUsedAt() != null) {
                    long t = v.getLastUsedAt().atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli();
                    if (t > max) max = t;
                }
            }
        }
        return max == 0 ? null : LocalDateTime.now();
    }

    @Autowired(required = false)
    private com.fashion.supplychain.intelligence.service.SelfCriticService selfCriticService;

    @Autowired(required = false)
    private PromptVariantPersistenceService variantPersistence;

    public double autoEvaluateAndRecord(String segmentName, String variantId, String userMessage,
                                          String aiResponse, java.util.List<com.fashion.supplychain.intelligence.agent.tool.AgentTool> toolCalls,
                                          java.util.List<String> toolResults, boolean usedQuickPath) {
        double score = 75.0;
        if (selfCriticService != null) {
            try {
                score = selfCriticService.calculateCritiqueScore(
                        null, userMessage, aiResponse, toolCalls, toolResults, null, usedQuickPath);
            } catch (Exception e) {
                log.debug("[PromptVariant] selfCritic evaluation failed: {}", e.getMessage());
            }
        } else {
            score = simpleHeuristicScore(userMessage, aiResponse);
        }
        recordScore(segmentName, variantId, score);
        if (variantPersistence != null) {
            try {
                Long dbId = variantPersistence.getVariantIdForSession(segmentName + ":" + variantId);
                if (dbId != null) {
                    variantPersistence.recordScore(dbId, score);
                }
            } catch (Exception e) {
                log.debug("[PromptVariant] DB score record failed: {}", e.getMessage());
            }
        }
        return score;
    }

    public void autoPromoteIfEligible(String segmentName) {
        try {
            promoteBestVariant(segmentName);
        } catch (Exception e) {
            log.debug("[PromptVariant] autoPromote failed: {}", e.getMessage());
        }
    }

    private double simpleHeuristicScore(String userMessage, String aiResponse) {
        if (aiResponse == null || aiResponse.isBlank()) return 30.0;
        double score = 50.0;
        if (aiResponse.length() >= 20 && aiResponse.length() <= 2000) score += 15;
        if (userMessage != null && aiResponse.toLowerCase().contains(
                userMessage.length() > 4 ? userMessage.substring(0, 4).toLowerCase() : "")) {
            score += 10;
        }
        if (aiResponse.contains("据我") || aiResponse.contains("我不确定") || aiResponse.contains("没有数据")) {
            score -= 10;
        }
        return Math.max(0, Math.min(100, score));
    }
}
