package com.fashion.supplychain.intelligence.service;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.DoubleAdder;
import java.util.stream.Collectors;

@Slf4j
@Service
public class AiAgentMetricsService {

    private final ConcurrentHashMap<String, AtomicLong> toolCallCounts = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, AtomicLong> toolFailCounts = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, DoubleAdder> toolDurationMs = new ConcurrentHashMap<>();
    private final AtomicLong totalRequests = new AtomicLong();
    private final AtomicLong totalSuccessRequests = new AtomicLong();
    private final AtomicLong totalFailedRequests = new AtomicLong();
    private final AtomicLong totalStuckDetected = new AtomicLong();
    private final AtomicLong totalTokenUsed = new AtomicLong();
    private final DoubleAdder totalDurationMs = new DoubleAdder();
    private final ConcurrentHashMap<String, AtomicLong> domainRouteCounts = new ConcurrentHashMap<>();
    private volatile LocalDateTime lastResetTime = LocalDateTime.now();

    public void recordRequestStart() {
        totalRequests.incrementAndGet();
    }

    public void recordRequestSuccess(long durationMs) {
        totalSuccessRequests.incrementAndGet();
        totalDurationMs.add(durationMs);
    }

    public void recordRequestFailure(long durationMs) {
        totalFailedRequests.incrementAndGet();
        totalDurationMs.add(durationMs);
    }

    public void recordToolCall(String toolName, long durationMs, boolean success) {
        toolCallCounts.computeIfAbsent(toolName, k -> new AtomicLong()).incrementAndGet();
        toolDurationMs.computeIfAbsent(toolName, k -> new DoubleAdder()).add(durationMs);
        if (!success) {
            toolFailCounts.computeIfAbsent(toolName, k -> new AtomicLong()).incrementAndGet();
        }
    }

    public void recordStuckDetected() {
        totalStuckDetected.incrementAndGet();
    }

    public void recordTokenUsage(long tokens) {
        totalTokenUsed.addAndGet(tokens);
    }

    public void recordDomainRoute(String domain) {
        domainRouteCounts.computeIfAbsent(domain, k -> new AtomicLong()).incrementAndGet();
    }

    public MetricsSnapshot getSnapshot() {
        MetricsSnapshot snapshot = new MetricsSnapshot();
        snapshot.setTimestamp(LocalDateTime.now());
        snapshot.setTotalRequests(totalRequests.get());
        snapshot.setTotalSuccess(totalSuccessRequests.get());
        snapshot.setTotalFailed(totalFailedRequests.get());
        snapshot.setTotalStuckDetected(totalStuckDetected.get());
        snapshot.setTotalTokenUsed(totalTokenUsed.get());
        long total = totalRequests.get();
        snapshot.setSuccessRate(total > 0 ? (double) totalSuccessRequests.get() / total : 0);
        snapshot.setAvgDurationMs(total > 0 ? totalDurationMs.sum() / total : 0);
        snapshot.setToolMetrics(buildToolMetrics());
        snapshot.setDomainRouteCounts(domainRouteCounts.entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().get())));
        snapshot.setLastResetTime(lastResetTime);
        return snapshot;
    }

    private List<ToolMetricEntry> buildToolMetrics() {
        List<ToolMetricEntry> entries = new ArrayList<>();
        for (Map.Entry<String, AtomicLong> entry : toolCallCounts.entrySet()) {
            String name = entry.getKey();
            long calls = entry.getValue().get();
            long fails = toolFailCounts.getOrDefault(name, new AtomicLong()).get();
            double avgMs = calls > 0 ? toolDurationMs.getOrDefault(name, new DoubleAdder()).sum() / calls : 0;
            ToolMetricEntry e = new ToolMetricEntry();
            e.setToolName(name);
            e.setCallCount(calls);
            e.setFailCount(fails);
            e.setFailRate(calls > 0 ? (double) fails / calls : 0);
            e.setAvgDurationMs(avgMs);
            entries.add(e);
        }
        entries.sort((a, b) -> Long.compare(b.getCallCount(), a.getCallCount()));
        return entries;
    }

    public void reset() {
        toolCallCounts.clear();
        toolFailCounts.clear();
        toolDurationMs.clear();
        totalRequests.set(0);
        totalSuccessRequests.set(0);
        totalFailedRequests.set(0);
        totalStuckDetected.set(0);
        totalTokenUsed.set(0);
        totalDurationMs.reset();
        domainRouteCounts.clear();
        lastResetTime = LocalDateTime.now();
        log.info("[AiAgentMetrics] 指标已重置");
    }

    @Data
    public static class MetricsSnapshot {
        private LocalDateTime timestamp;
        private long totalRequests;
        private long totalSuccess;
        private long totalFailed;
        private long totalStuckDetected;
        private long totalTokenUsed;
        private double successRate;
        private double avgDurationMs;
        private List<ToolMetricEntry> toolMetrics;
        private Map<String, Long> domainRouteCounts;
        private LocalDateTime lastResetTime;
    }

    @Data
    public static class ToolMetricEntry {
        private String toolName;
        private long callCount;
        private long failCount;
        private double failRate;
        private double avgDurationMs;
    }
}
