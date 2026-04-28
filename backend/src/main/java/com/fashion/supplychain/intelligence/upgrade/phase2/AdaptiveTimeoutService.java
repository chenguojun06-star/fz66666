package com.fashion.supplychain.intelligence.upgrade.phase2;

import lombok.Data;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

@Service
public class AdaptiveTimeoutService {

    private static final int MAX_SAMPLES = 200;
    private static final int MIN_TIMEOUT_MS = 5000;
    private static final int MAX_TIMEOUT_MS = 60000;
    private static final double BUFFER_RATIO = 1.2;

    private final Map<String, Deque<Long>> toolLatencies = new ConcurrentHashMap<>();
    private final Map<String, Deque<Long>> sceneLatencies = new ConcurrentHashMap<>();

    public void recordToolLatency(String toolName, long latencyMs) {
        Deque<Long> deque = toolLatencies.computeIfAbsent(toolName, k -> new ConcurrentLinkedDeque<>());
        deque.addFirst(latencyMs);
        while (deque.size() > MAX_SAMPLES) deque.pollLast();
    }

    public void recordSceneLatency(String scene, long latencyMs) {
        Deque<Long> deque = sceneLatencies.computeIfAbsent(scene, k -> new ConcurrentLinkedDeque<>());
        deque.addFirst(latencyMs);
        while (deque.size() > MAX_SAMPLES) deque.pollLast();
    }

    public int resolveToolTimeout(String toolName, int defaultTimeoutMs) {
        Deque<Long> samples = toolLatencies.get(toolName);
        if (samples == null || samples.size() < 5) return defaultTimeoutMs;
        long p95 = calcP95(samples);
        int adaptive = (int) (p95 * BUFFER_RATIO);
        return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, adaptive));
    }

    public int resolveSceneTimeout(String scene, int defaultTimeoutMs) {
        Deque<Long> samples = sceneLatencies.get(scene);
        if (samples == null || samples.size() < 5) return defaultTimeoutMs;
        long p95 = calcP95(samples);
        int adaptive = (int) (p95 * BUFFER_RATIO);
        return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, adaptive));
    }

    public PartialRecoveryResult attemptPartialRecovery(String partialContent, String error) {
        PartialRecoveryResult result = new PartialRecoveryResult();
        result.recovered = false;
        result.content = partialContent;
        result.recoveryReason = error;
        if (partialContent == null || partialContent.isBlank()) return result;
        String trimmed = partialContent.trim();
        if (trimmed.startsWith("{") && !trimmed.endsWith("}")) {
            try {
                int depth = 0;
                for (char c : trimmed.toCharArray()) {
                    if (c == '{') depth++;
                    else if (c == '}') depth--;
                }
                StringBuilder sb = new StringBuilder(trimmed);
                for (int i = 0; i < depth; i++) sb.append("}");
                com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                mapper.readTree(sb.toString());
                result.recovered = true;
                result.content = sb.toString();
                result.recoveryReason = "auto-closed " + depth + " brackets";
            } catch (Exception ignored) {}
        } else if (trimmed.startsWith("[") && !trimmed.endsWith("]")) {
            result.content = trimmed + "]";
            result.recovered = true;
            result.recoveryReason = "auto-closed array bracket";
        }
        return result;
    }

    private long calcP95(Deque<Long> samples) {
        List<Long> sorted = new ArrayList<>(samples);
        Collections.sort(sorted);
        int idx = (int) Math.ceil(0.95 * sorted.size()) - 1;
        return sorted.get(Math.max(0, Math.min(idx, sorted.size() - 1)));
    }

    @Data
    public static class PartialRecoveryResult {
        private boolean recovered;
        private String content;
        private String recoveryReason;
    }
}
