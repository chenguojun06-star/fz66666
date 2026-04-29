package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.gateway.AiInferenceGateway;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

@Service
@Slf4j
public class SelfConsistencyVerifier {

    private static final int DEFAULT_SAMPLE_COUNT = 3;
    private static final double SAMPLING_TEMPERATURE = 0.7;
    private static final Set<String> HIGH_RISK_SCENES = Set.of(
            "payroll_approve", "order_edit", "batch_close", "finance_settlement",
            "order_transfer", "price_adjustment", "expense_reimbursement_approve"
    );

    @Value("${ai.self-consistency.enabled:true}")
    private boolean enabled;

    @Value("${ai.self-consistency.sample-count:3}")
    private int sampleCount;

    @Value("${ai.self-consistency.max-concurrent:2}")
    private int maxConcurrent;

    private final ExecutorService executor = Executors.newFixedThreadPool(
            Runtime.getRuntime().availableProcessors(),
            r -> { Thread t = new Thread(r, "sc-verify"); t.setDaemon(true); return t; }
    );

    private final AiInferenceGateway inferenceGateway;

    public SelfConsistencyVerifier(AiInferenceGateway inferenceGateway) {
        this.inferenceGateway = inferenceGateway;
    }

    public boolean isHighRiskScene(String scene) {
        String normalized = scene != null && scene.startsWith("tool_") ? scene.substring(5) : scene;
        return HIGH_RISK_SCENES.contains(normalized);
    }

    public SelfConsistencyResult verify(String scene, List<AiMessage> messages, List<AiTool> tools) {
        if (!enabled || !isHighRiskScene(scene)) {
            return SelfConsistencyResult.single();
        }

        int n = Math.max(2, Math.min(sampleCount, DEFAULT_SAMPLE_COUNT));
        List<IntelligenceInferenceResult> samples = new ArrayList<>();
        List<Future<IntelligenceInferenceResult>> futures = new ArrayList<>();

        for (int i = 0; i < n; i++) {
            futures.add(executor.submit(() ->
                    inferenceGateway.chat(scene + ":sc-verify", messages, tools)));
        }

        for (Future<IntelligenceInferenceResult> f : futures) {
            try {
                samples.add(f.get(30, TimeUnit.SECONDS));
            } catch (Exception e) {
                log.warn("[SelfConsistency] 采样失败: {}", e.getMessage());
            }
        }

        return aggregate(samples);
    }

    private SelfConsistencyResult aggregate(List<IntelligenceInferenceResult> samples) {
        if (samples.isEmpty()) {
            return SelfConsistencyResult.failed();
        }

        List<String> successContents = samples.stream()
                .filter(IntelligenceInferenceResult::isSuccess)
                .map(IntelligenceInferenceResult::getContent)
                .filter(Objects::nonNull)
                .toList();

        if (successContents.isEmpty()) {
            return SelfConsistencyResult.failed();
        }

        Map<String, AtomicInteger> frequency = new HashMap<>();
        for (String content : successContents) {
            String key = normalizeForComparison(content);
            frequency.computeIfAbsent(key, k -> new AtomicInteger(0)).incrementAndGet();
        }

        String consensusKey = frequency.entrySet().stream()
                .max(Comparator.comparingInt(e -> e.getValue().get()))
                .map(Map.Entry::getKey)
                .orElse("");

        int consensusCount = frequency.getOrDefault(consensusKey, new AtomicInteger(0)).get();
        double agreement = (double) consensusCount / successContents.size();

        String bestContent = successContents.stream()
                .filter(c -> normalizeForComparison(c).equals(consensusKey))
                .findFirst()
                .orElse(successContents.get(0));

        SelfConsistencyResult result = new SelfConsistencyResult();
        result.setVerified(true);
        result.setSampleCount(samples.size());
        result.setSuccessCount(successContents.size());
        result.setAgreement(agreement);
        result.setConsensusContent(bestContent);
        result.setHighConfidence(agreement >= 0.66);
        return result;
    }

    private String normalizeForComparison(String content) {
        if (content == null) return "";
        return content.trim().toLowerCase().replaceAll("\\s+", " ");
    }

    @lombok.Data
    public static class SelfConsistencyResult {
        private boolean verified;
        private int sampleCount;
        private int successCount;
        private double agreement;
        private String consensusContent;
        private boolean highConfidence;

        static SelfConsistencyResult single() {
            SelfConsistencyResult r = new SelfConsistencyResult();
            r.setVerified(false);
            r.setSampleCount(1);
            r.setSuccessCount(1);
            r.setAgreement(1.0);
            r.setHighConfidence(true);
            return r;
        }

        static SelfConsistencyResult failed() {
            SelfConsistencyResult r = new SelfConsistencyResult();
            r.setVerified(true);
            r.setSampleCount(0);
            r.setSuccessCount(0);
            r.setAgreement(0.0);
            r.setHighConfidence(false);
            return r;
        }
    }
}
