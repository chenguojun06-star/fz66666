package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.IntelligenceBrainSnapshotResponse;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.entity.IntelligenceMetrics;
import com.fashion.supplychain.intelligence.mapper.IntelligenceMetricsMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * AI 可观测编排器。
 *
 * <p>职责：统一暴露 AI 可观测与评估层的配置状态，
 * 记录每次AI调用的度量指标到数据库，并提供聚合查询。</p>
 */
@Service
@Slf4j
public class IntelligenceObservabilityOrchestrator {

    @Value("${ai.observability.enabled:false}")
    private boolean enabled;

    @Value("${ai.observability.provider:none}")
    private String provider;

    @Value("${ai.observability.endpoint:}")
    private String endpoint;

    @Value("${ai.observability.capture-prompts:false}")
    private boolean capturePrompts;

    @Value("${ai.observability.sample-rate:100}")
    private int sampleRate;

    /** 单次调用延迟超过此阈值则输出 WARN（毫秒） */
    private static final int LATENCY_WARN_THRESHOLD_MS = 30_000;

    @Autowired
    private IntelligenceMetricsMapper metricsMapper;

    public void recordInvocation(String scene,
                                 IntelligenceInferenceResult result,
                                 Long tenantId,
                                 String userId) {
        // 持久化到数据库（不受 enabled 开关影响，始终记录）
        try {
            IntelligenceMetrics metrics = new IntelligenceMetrics();
            metrics.setTenantId(tenantId);
            metrics.setScene(scene);
            metrics.setProvider(result.getProvider());
            metrics.setModel(result.getModel());
            metrics.setTraceId(result.getTraceId());
            metrics.setTraceUrl(result.getTraceUrl());
            metrics.setSuccess(result.isSuccess());
            metrics.setFallbackUsed(result.isFallbackUsed());
            metrics.setLatencyMs((int) result.getLatencyMs());
            metrics.setPromptChars(result.getPromptChars());
            metrics.setResponseChars(result.getResponseChars());
            metrics.setToolCallCount(result.getToolCallCount());
            metrics.setPromptTokens(result.getPromptTokens());
            metrics.setCompletionTokens(result.getCompletionTokens());
            metrics.setErrorMessage(result.getErrorMessage());
            metrics.setUserId(userId);
            metrics.setCreateTime(LocalDateTime.now());
            metrics.setDeleteFlag(0);
            metricsMapper.insert(metrics);
        } catch (Exception e) {
            log.warn("[AI_OBSERVABILITY] 度量持久化失败（不影响业务）: {}", e.getMessage());
        }

        // F30：延迟异常检测
        if (result.getLatencyMs() > LATENCY_WARN_THRESHOLD_MS) {
            log.warn("[AI_ANOMALY] 高延迟告警 scene={} latencyMs={} model={} traceId={}",
                    scene, result.getLatencyMs(), result.getModel(), result.getTraceId());
        }

        // 结构化日志（受 enabled + sample-rate 控制）
        if (!shouldRecord() || !hitSample()) {
            return;
        }
        String promptNote = capturePrompts
                ? String.format("promptChars=%d,responseChars=%d", result.getPromptChars(), result.getResponseChars())
                : "promptChars=masked,responseChars=masked";
        log.info("[AI_OBSERVABILITY] traceId={} provider={} scene={} tenantId={} userId={} success={} fallback={} latencyMs={} model={} toolCalls={} promptTokens={} completionTokens={} status={} {} error={} traceUrl={}",
                result.getTraceId(),
                result.getProvider(),
                scene,
                tenantId,
                userId,
                result.isSuccess(),
                result.isFallbackUsed(),
                result.getLatencyMs(),
                result.getModel(),
                result.getToolCallCount(),
                result.getPromptTokens(),
                result.getCompletionTokens(),
                resolveStatus(),
                promptNote,
                result.getErrorMessage(),
                result.getTraceUrl());
    }

    /**
     * 获取度量概览（按场景聚合最近N天的调用统计）
     * 若表尚未创建（V43 未执行）或查询异常，返回空列表而非 500
     */
    public List<Map<String, Object>> getMetricsOverview(Long tenantId, int days) {
        try {
            return metricsMapper.aggregateByScene(tenantId, days);
        } catch (Exception e) {
            log.warn("[AI_OBSERVABILITY] 指标查询失败（表可能尚未就绪，V43/V45 执行后自动恢复）: {}", e.getMessage());
            return java.util.Collections.emptyList();
        }
    }

    public List<Map<String, Object>> getRecentInvocations(Long tenantId, int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 100));
        try {
            return metricsMapper.listRecentInvocations(tenantId, safeLimit);
        } catch (Exception e) {
            log.warn("[AI_OBSERVABILITY] 最近调用查询失败（表可能尚未就绪）: {}", e.getMessage());
            return java.util.Collections.emptyList();
        }
    }

    public IntelligenceBrainSnapshotResponse.ObservabilitySummary getObservabilitySummary() {
        IntelligenceBrainSnapshotResponse.ObservabilitySummary summary =
                new IntelligenceBrainSnapshotResponse.ObservabilitySummary();
        summary.setEnabled(enabled);
        summary.setProvider(normalizeProvider());
        summary.setEndpoint(maskUrl(endpoint));
        summary.setCapturePrompts(capturePrompts);
        summary.setSampleRate(normalizeSampleRate());
        summary.setStatus(resolveStatus());
        return summary;
    }

    public boolean isObservationReady() {
        return enabled && hasText(provider) && !"none".equalsIgnoreCase(provider);
    }

    public String buildTraceUrl(String traceId) {
        if (!hasText(traceId) || !hasText(endpoint)) {
            return null;
        }
        String base = endpoint.trim();
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        if ("langfuse".equalsIgnoreCase(normalizeProvider())) {
            return base + "/trace/" + traceId;
        }
        return base + "/traces/" + traceId;
    }

    /**
     * F30：健康指标检查 — 查询最近 N 次调用，返回异常告警列表。
     * 调用方：IntelligenceBrainSnapshot / 定时巡检 / 管理面板
     */
    public Map<String, Object> checkHealthIndicators(Long tenantId, int recentCount) {
        Map<String, Object> health = new java.util.LinkedHashMap<>();
        try {
            List<Map<String, Object>> recent = metricsMapper.listRecentInvocations(tenantId,
                    Math.max(10, Math.min(recentCount, 200)));
            if (recent.isEmpty()) {
                health.put("status", "no_data");
                health.put("alerts", java.util.Collections.emptyList());
                return health;
            }
            long total = recent.size();
            long failures = recent.stream()
                    .filter(m -> Boolean.FALSE.equals(m.get("success")) || Integer.valueOf(0).equals(m.get("success")))
                    .count();
            double errorRate = (double) failures / total;

            double avgLatency = recent.stream()
                    .filter(m -> m.get("latency_ms") instanceof Number)
                    .mapToInt(m -> ((Number) m.get("latency_ms")).intValue())
                    .average().orElse(0);

            long fallbackCount = recent.stream()
                    .filter(m -> Boolean.TRUE.equals(m.get("fallback_used")) || Integer.valueOf(1).equals(m.get("fallback_used")))
                    .count();

            List<String> alerts = new java.util.ArrayList<>();
            if (errorRate > 0.5) {
                alerts.add(String.format("错误率过高: %.0f%% (%d/%d)", errorRate * 100, failures, total));
            }
            if (avgLatency > 20_000) {
                alerts.add(String.format("平均延迟过高: %.0fms", avgLatency));
            }
            if (fallbackCount > total * 0.3) {
                alerts.add(String.format("降级频繁: %d/%d 次使用 fallback", fallbackCount, total));
            }

            health.put("status", alerts.isEmpty() ? "healthy" : "degraded");
            health.put("errorRate", String.format("%.1f%%", errorRate * 100));
            health.put("avgLatencyMs", (int) avgLatency);
            health.put("fallbackRate", String.format("%.1f%%", (double) fallbackCount / total * 100));
            health.put("sampleSize", total);
            health.put("alerts", alerts);
        } catch (Exception e) {
            log.warn("[AI_ANOMALY] 健康指标查询失败: {}", e.getMessage());
            health.put("status", "query_error");
            health.put("alerts", java.util.Collections.singletonList("健康指标查询异常: " + e.getMessage()));
        }
        return health;
    }

    private boolean shouldRecord() {
        return enabled && hasText(provider) && hasText(endpoint);
    }

    private boolean hitSample() {
        int normalized = normalizeSampleRate();
        if (normalized >= 100) {
            return true;
        }
        if (normalized <= 0) {
            return false;
        }
        return Math.floorMod(System.nanoTime(), 100) < normalized;
    }

    private String resolveStatus() {
        if (!enabled) {
            return "disabled";
        }
        if (!hasText(provider) || "none".equalsIgnoreCase(provider)) {
            return "provider-missing";
        }
        if (!hasText(endpoint)) {
            return "endpoint-missing";
        }
        return "ready";
    }

    private int normalizeSampleRate() {
        if (sampleRate < 0) {
            return 0;
        }
        return Math.min(sampleRate, 100);
    }

    private String normalizeProvider() {
        return hasText(provider) ? provider.trim().toLowerCase() : "none";
    }

    private String maskUrl(String url) {
        if (!hasText(url)) {
            return null;
        }
        String value = url.trim();
        int queryIndex = value.indexOf('?');
        return queryIndex >= 0 ? value.substring(0, queryIndex) : value;
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
