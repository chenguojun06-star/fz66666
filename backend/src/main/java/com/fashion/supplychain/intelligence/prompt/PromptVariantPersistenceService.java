package com.fashion.supplychain.intelligence.prompt;

import com.fashion.supplychain.intelligence.entity.PromptVariantEntity;
import com.fashion.supplychain.intelligence.mapper.PromptVariantMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class PromptVariantPersistenceService {

    private final PromptVariantMapper variantMapper;
    private final ConcurrentMap<String, String> sessionToVariant = new ConcurrentHashMap<>();

    public PromptVariantEntity registerFromContent(Long tenantId, String intent, String content,
                                                      String variantType, int weight) {
        if (tenantId == null || intent == null || content == null) return null;
        try {
            PromptVariantEntity v = new PromptVariantEntity();
            v.setTenantId(tenantId);
            v.setIntent(intent);
            v.setVariantName("V-" + intent + "-" + UUID.randomUUID().toString().substring(0, 6));
            v.setContent(content);
            v.setVariantType(variantType == null ? "experiment" : variantType);
            v.setTrafficWeight(weight);
            v.setStatus("active");
            v.setHitCount(0L);
            v.setTotalScore(0.0);
            v.setAvgScore(0.0);
            v.setEvolveRound(0);
            v.setCreateTime(LocalDateTime.now());
            v.setUpdateTime(LocalDateTime.now());
            variantMapper.insert(v);
            return v;
        } catch (Exception e) {
            log.debug("[PromptVariantPersistence] register failed: {}", e.getMessage());
            return null;
        }
    }

    public PromptVariantEntity pickVariantForIntent(Long tenantId, String intent) {
        if (tenantId == null || intent == null) return null;
        try {
            List<PromptVariantEntity> active = variantMapper.findActiveByIntent(tenantId, intent, 0);
            if (active == null || active.isEmpty()) return null;
            int totalWeight = active.stream()
                    .filter(v -> v.getTrafficWeight() != null)
                    .mapToInt(PromptVariantEntity::getTrafficWeight)
                    .sum();
            if (totalWeight <= 0) return active.get(0);
            int pick = (int) (Math.random() * totalWeight);
            int cum = 0;
            for (PromptVariantEntity v : active) {
                cum += v.getTrafficWeight() == null ? 0 : v.getTrafficWeight();
                if (pick <= cum) return v;
            }
            return active.get(0);
        } catch (Exception e) {
            log.debug("[PromptVariantPersistence] pick failed: {}", e.getMessage());
            return null;
        }
    }

    public void recordUsage(Long variantId) {
        if (variantId == null) return;
        try {
            variantMapper.incrementHit(variantId);
        } catch (Exception e) {
            log.debug("[PromptVariantPersistence] recordUsage failed: {}", e.getMessage());
        }
    }

    public void recordScore(Long variantId, double score) {
        if (variantId == null) return;
        try {
            PromptVariantEntity v = variantMapper.selectById(variantId);
            if (v == null) return;
            long newHits = (v.getHitCount() == null ? 0 : v.getHitCount()) + 1;
            double newTotal = (v.getTotalScore() == null ? 0 : v.getTotalScore()) + score;
            double newAvg = newTotal / Math.max(1, newHits);
            variantMapper.updateScore(variantId, newTotal, newAvg);
        } catch (Exception e) {
            log.debug("[PromptVariantPersistence] recordScore failed: {}", e.getMessage());
        }
    }

    public void bindSession(String sessionId, Long variantId) {
        if (sessionId == null || variantId == null) return;
        sessionToVariant.put(sessionId, String.valueOf(variantId));
    }

    public Long getVariantIdForSession(String sessionId) {
        if (sessionId == null) return null;
        String v = sessionToVariant.get(sessionId);
        if (v == null) return null;
        try {
            return Long.parseLong(v);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public int totalVariants(Long tenantId, String intent) {
        if (tenantId == null || intent == null) return 0;
        try {
            return variantMapper.findActiveByIntent(tenantId, intent, 0).size();
        } catch (Exception e) {
            return 0;
        }
    }

    public List<PromptVariantEntity> findActive(Long tenantId, String intent) {
        if (tenantId == null || intent == null) return List.of();
        try {
            return variantMapper.findActiveByIntent(tenantId, intent, 0);
        } catch (Exception e) {
            return List.of();
        }
    }
}
