package com.fashion.supplychain.intelligence.upgrade.phase2;

import lombok.Data;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class LlmObservabilityService {

    private static final int MAX_TRACES = 1000;
    private static final int MAX_TOOL_INVOCATIONS = 5000;

    private final Deque<CallTrace> recentTraces = new ConcurrentLinkedDeque<>();
    private final Deque<ToolInvocation> recentToolInvocations = new ConcurrentLinkedDeque<>();
    private final Map<String, ProviderStats> providerStatsMap = new ConcurrentHashMap<>();
    private final Map<String, FallbackPathStats> fallbackPaths = new ConcurrentHashMap<>();
    private final AtomicLong totalRequests = new AtomicLong();
    private final AtomicLong totalSuccess = new AtomicLong();
    private final AtomicLong totalFallback = new AtomicLong();
    private final AtomicLong totalFailed = new AtomicLong();

    public void recordTrace(CallTrace trace) {
        totalRequests.incrementAndGet();
        if (trace.success) totalSuccess.incrementAndGet();
        else totalFailed.incrementAndGet();
        if (trace.fallbackUsed) totalFallback.incrementAndGet();
        recentTraces.addFirst(trace);
        while (recentTraces.size() > MAX_TRACES) recentTraces.pollLast();
        providerStatsMap.computeIfAbsent(trace.provider, k -> new ProviderStats()).record(trace);
        if (trace.fallbackUsed && trace.fallbackPath != null) {
            fallbackPaths.computeIfAbsent(trace.fallbackPath, k -> new FallbackPathStats()).record(trace);
        }
    }

    public void recordToolInvocation(ToolInvocation inv) {
        recentToolInvocations.addFirst(inv);
        while (recentToolInvocations.size() > MAX_TOOL_INVOCATIONS) recentToolInvocations.pollLast();
    }

    public DashboardSnapshot getDashboard() {
        DashboardSnapshot d = new DashboardSnapshot();
        d.totalRequests = totalRequests.get();
        d.totalSuccess = totalSuccess.get();
        d.totalFailed = totalFailed.get();
        d.totalFallback = totalFallback.get();
        d.availabilityRate = totalRequests.get() > 0 ? (double) totalSuccess.get() / totalRequests.get() * 100 : 100.0;

        List<CallTrace> traces = new ArrayList<>(recentTraces);
        if (!traces.isEmpty()) {
            traces.sort(Comparator.comparingLong(t -> t.latencyMs));
            d.p50LatencyMs = percentile(traces, 50);
            d.p95LatencyMs = percentile(traces, 95);
            d.p99LatencyMs = percentile(traces, 99);
            d.avgLatencyMs = (long) traces.stream().mapToLong(t -> t.latencyMs).average().orElse(0);
        }

        d.providers = new ArrayList<>();
        providerStatsMap.forEach((p, s) -> d.providers.add(s.toSnapshot(p)));
        d.fallbackPaths = new ArrayList<>();
        fallbackPaths.forEach((p, s) -> d.fallbackPaths.add(s.toSnapshot(p)));
        d.recentTraces = new ArrayList<>(recentTraces);
        d.recentToolInvocations = new ArrayList<>(recentToolInvocations);
        return d;
    }

    private long percentile(List<CallTrace> sorted, int pct) {
        int idx = (int) Math.ceil(pct / 100.0 * sorted.size()) - 1;
        return sorted.get(Math.max(0, Math.min(idx, sorted.size() - 1))).latencyMs;
    }

    @Data
    public static class CallTrace {
        private String traceId;
        private String scene;
        private String provider;
        private String model;
        private boolean success;
        private boolean fallbackUsed;
        private String fallbackPath;
        private long latencyMs;
        private int promptTokens;
        private int completionTokens;
        private int toolCallCount;
        private String errorMessage;
        private Long tenantId;
        private String userId;
        private LocalDateTime timestamp;
    }

    @Data
    public static class ToolInvocation {
        private String traceId;
        private String toolName;
        private String resultSummary;
        private long latencyMs;
        private boolean success;
        private String errorCategory;
        private LocalDateTime timestamp;
    }

    @Data
    public static class ProviderSnapshot {
        private String provider;
        private long totalRequests;
        private long successCount;
        private long failureCount;
        private double availabilityRate;
        private long p50Ms;
        private long p95Ms;
        private long avgMs;
    }

    @Data
    public static class FallbackPathSnapshot {
        private String path;
        private long count;
        private long avgLatencyMs;
    }

    @Data
    public static class DashboardSnapshot {
        private long totalRequests;
        private long totalSuccess;
        private long totalFailed;
        private long totalFallback;
        private double availabilityRate;
        private long avgLatencyMs;
        private long p50LatencyMs;
        private long p95LatencyMs;
        private long p99LatencyMs;
        private List<ProviderSnapshot> providers;
        private List<FallbackPathSnapshot> fallbackPaths;
        private List<CallTrace> recentTraces;
        private List<ToolInvocation> recentToolInvocations;
    }

    static class ProviderStats {
        final AtomicLong requests = new AtomicLong();
        final AtomicLong successes = new AtomicLong();
        final AtomicLong failures = new AtomicLong();
        final Deque<Long> recentLatencies = new ConcurrentLinkedDeque<>();

        void record(CallTrace t) {
            requests.incrementAndGet();
            if (t.success) successes.incrementAndGet();
            else failures.incrementAndGet();
            recentLatencies.addFirst(t.latencyMs);
            while (recentLatencies.size() > 200) recentLatencies.pollLast();
        }

        ProviderSnapshot toSnapshot(String provider) {
            ProviderSnapshot s = new ProviderSnapshot();
            s.provider = provider;
            s.totalRequests = requests.get();
            s.successCount = successes.get();
            s.failureCount = failures.get();
            s.availabilityRate = requests.get() > 0 ? (double) successes.get() / requests.get() * 100 : 0;
            List<Long> lat = new ArrayList<>(recentLatencies);
            if (!lat.isEmpty()) {
                Collections.sort(lat);
                s.p50Ms = latPct(lat, 50);
                s.p95Ms = latPct(lat, 95);
                s.avgMs = (long) lat.stream().mapToLong(v -> v).average().orElse(0);
            }
            return s;
        }

        private long latPct(List<Long> sorted, int pct) {
            int idx = (int) Math.ceil(pct / 100.0 * sorted.size()) - 1;
            return sorted.get(Math.max(0, Math.min(idx, sorted.size() - 1)));
        }
    }

    static class FallbackPathStats {
        final AtomicLong count = new AtomicLong();
        final Deque<Long> latencies = new ConcurrentLinkedDeque<>();

        void record(CallTrace t) {
            count.incrementAndGet();
            latencies.addFirst(t.latencyMs);
            while (latencies.size() > 100) latencies.pollLast();
        }

        FallbackPathSnapshot toSnapshot(String path) {
            FallbackPathSnapshot s = new FallbackPathSnapshot();
            s.path = path;
            s.count = count.get();
            s.avgLatencyMs = latencies.isEmpty() ? 0 : (long) latencies.stream().mapToLong(v -> v).average().orElse(0);
            return s;
        }
    }
}
