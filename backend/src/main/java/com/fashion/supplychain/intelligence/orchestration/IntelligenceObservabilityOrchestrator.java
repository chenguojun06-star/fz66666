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
            metrics.setErrorMessage(result.getErrorMessage());
            metrics.setUserId(userId);
            metrics.setCreateTime(LocalDateTime.now());
            metrics.setDeleteFlag(0);
            metricsMapper.insert(metrics);
        } catch (Exception e) {
            log.warn("[AI_OBSERVABILITY] 度量持久化失败（不影响业务）: {}", e.getMessage());
        }

        // 结构化日志（受 enabled + sample-rate 控制）
        if (!shouldRecord() || !hitSample()) {
            return;
        }
        String promptNote = capturePrompts
                ? String.format("promptChars=%d,responseChars=%d", result.getPromptChars(), result.getResponseChars())
                : "promptChars=masked,responseChars=masked";
        log.info("[AI_OBSERVABILITY] traceId={} provider={} scene={} tenantId={} userId={} success={} fallback={} latencyMs={} model={} toolCalls={} status={} {} error={} traceUrl={}",
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
