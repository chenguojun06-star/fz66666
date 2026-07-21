package com.fashion.supplychain.intelligence.engine.feature;

import com.fashion.supplychain.intelligence.engine.featureflag.FeatureFlagTenantService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.Arrays;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@Component
@Lazy
public class IntelligenceFeatureFlag {

    @Value("${intelligence.cognition.enabled:false}")
    private boolean cognitionEnabled;

    @Value("${intelligence.cognition.rollout-tenants:}")
    private String cognitionTenantsCsv;

    @Value("${intelligence.execution.enabled:false}")
    private boolean executionEnabled;

    @Value("${intelligence.execution.rollout-tenants:}")
    private String executionTenantsCsv;

    @Value("${intelligence.perception.enabled:false}")
    private boolean perceptionEnabled;

    @Value("${intelligence.perception.rollout-tenants:}")
    private String perceptionTenantsCsv;

    @Value("${xiaoyun.prompt-evolution.enabled:true}")
    private boolean promptEvolutionEnabled;

    @Value("${intelligence.kg-snapshot.enabled:true}")
    private boolean kgSnapshotEnabled;

    @Value("${intelligence.risk-persistence.enabled:true}")
    private boolean riskPersistenceEnabled;

    @Value("${intelligence.llm-fallback.enabled:true}")
    private boolean llmFallbackEnabled;

    @Autowired(required = false)
    private FeatureFlagTenantService tenantService;

    private final ConcurrentHashMap<String, AtomicLong> decisionStats = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Long> lastRefreshTime = new ConcurrentHashMap<>();

    public boolean useNewCognition(Long tenantId) {
        return decide("cognition", tenantId, cognitionEnabled, cognitionTenantsCsv);
    }

    public boolean useNewExecution(Long tenantId) {
        return decide("execution", tenantId, executionEnabled, executionTenantsCsv);
    }

    public boolean useNewPerception(Long tenantId) {
        return decide("perception", tenantId, perceptionEnabled, perceptionTenantsCsv);
    }

    public boolean usePromptEvolution(Long tenantId) {
        if (!promptEvolutionEnabled) {
            recordDecision("prompt-evolution", false);
            return false;
        }
        recordDecision("prompt-evolution", true);
        return true;
    }

    public boolean useKgSnapshot(Long tenantId) {
        recordDecision("kg-snapshot", kgSnapshotEnabled);
        return kgSnapshotEnabled;
    }

    public boolean useRiskPersistence(Long tenantId) {
        recordDecision("risk-persistence", riskPersistenceEnabled);
        return riskPersistenceEnabled;
    }

    public boolean useLlmFallback(Long tenantId) {
        recordDecision("llm-fallback", llmFallbackEnabled);
        return llmFallbackEnabled;
    }

    private boolean decide(String feature, Long tenantId, boolean masterEnabled, String csv) {
        if (!masterEnabled) {
            recordDecision(feature, false);
            return false;
        }
        if (tenantId == null) {
            recordDecision(feature, false);
            return false;
        }

        if (tenantService != null && tenantService.hasTenantFlag(tenantId, feature)) {
            boolean fromDb = tenantService.isFeatureEnabled(tenantId, feature);
            recordDecision(feature, fromDb);
            return fromDb;
        }

        boolean inCsv = isInRollout(tenantId, csv);
        recordDecision(feature, inCsv);
        return inCsv;
    }

    private boolean isInRollout(Long tenantId, String csv) {
        if (csv == null || csv.isBlank()) return false;
        List<String> ids = Arrays.asList(csv.split(","));
        return ids.contains(String.valueOf(tenantId));
    }

    private void recordDecision(String feature, boolean enabled) {
        try {
            String key = feature + ":" + (enabled ? "on" : "off");
            decisionStats.computeIfAbsent(key, k -> new AtomicLong(0)).incrementAndGet();
        } catch (Exception e) {
            log.debug("[FeatureFlag] stats record failed: {}", e.getMessage());
        }
    }

    public java.util.Map<String, Long> getDecisionStats() {
        java.util.Map<String, Long> result = new java.util.HashMap<>();
        for (var entry : decisionStats.entrySet()) {
            result.put(entry.getKey(), entry.getValue().get());
        }
        return result;
    }

    public void clearStats() {
        decisionStats.clear();
    }
}
