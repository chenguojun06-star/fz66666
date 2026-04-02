package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.IntelligenceBrainSnapshotResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 智能模型网关编排器。
 *
 * <p>职责：统一暴露当前 AI 调用出口的治理状态，
 * 为后续 LiteLLM/Ollama/兼容 OpenAI 网关接入提供独立边界。</p>
 *
 * <p>F29-增强：内置轻量级断路器状态追踪，连续失败超阈值后自动标记为不健康，
 * 冷却期过後自动恢复（半开探测）。调用方通过 {@link #isCircuitOpen()} 判断网关是否可用。</p>
 */
@Service
@Slf4j
public class IntelligenceModelGatewayOrchestrator {

    /** 连续失败达到此阈值后断路器打开 */
    private static final int CIRCUIT_OPEN_THRESHOLD = 5;
    /** 断路器打开后的冷却时间（毫秒），过後允许半开探测 */
    private static final long COOLDOWN_MS = 60_000L;

    private final AtomicInteger consecutiveFailures = new AtomicInteger(0);
    private volatile long lastFailureTimestamp = 0;

    @Value("${ai.gateway.litellm.enabled:false}")
    private boolean litellmEnabled;

    @Value("${ai.gateway.litellm.base-url:}")
    private String litellmBaseUrl;

    @Value("${ai.gateway.litellm.default-model:}")
    private String litellmDefaultModel;

    @Value("${ai.gateway.routing-strategy:direct}")
    private String routingStrategy;

    @Value("${ai.gateway.fallback-enabled:true}")
    private boolean fallbackEnabled;

    @Value("${ai.deepseek.model:deepseek-chat}")
    private String directModel;

    public IntelligenceBrainSnapshotResponse.ModelGatewaySummary getGatewaySummary() {
        IntelligenceBrainSnapshotResponse.ModelGatewaySummary summary =
                new IntelligenceBrainSnapshotResponse.ModelGatewaySummary();
        summary.setEnabled(litellmEnabled);
        summary.setProvider(litellmEnabled ? "litellm" : "direct");
        summary.setBaseUrl(maskUrl(litellmBaseUrl));
        summary.setRoutingStrategy(normalizeRoutingStrategy());
        summary.setActiveModel(litellmEnabled && hasText(litellmDefaultModel) ? litellmDefaultModel : directModel);
        summary.setFallbackEnabled(fallbackEnabled);
        summary.setStatus(resolveStatus());
        return summary;
    }

    public String getGatewayBaseUrl() {
        return litellmBaseUrl;
    }

    public String getActiveModelName() {
        return litellmEnabled && hasText(litellmDefaultModel) ? litellmDefaultModel : directModel;
    }

    public boolean isFallbackEnabled() {
        return fallbackEnabled;
    }

    public boolean isGatewayReady() {
        return litellmEnabled && hasText(litellmBaseUrl);
    }

    // ────────── 断路器状态管理 ──────────

    /** 记录一次成功调用，重置连续失败计数器 */
    public void recordSuccess() {
        int prev = consecutiveFailures.getAndSet(0);
        if (prev >= CIRCUIT_OPEN_THRESHOLD) {
            log.info("[GatewayCircuitBreaker] 断路器关闭，网关恢复健康（前连续失败 {} 次）", prev);
        }
    }

    /** 记录一次失败调用，超过阈值后打开断路器 */
    public void recordFailure() {
        int current = consecutiveFailures.incrementAndGet();
        lastFailureTimestamp = System.currentTimeMillis();
        if (current == CIRCUIT_OPEN_THRESHOLD) {
            log.warn("[GatewayCircuitBreaker] 连续失败 {} 次，断路器打开（冷却 {}ms）", current, COOLDOWN_MS);
        }
    }

    /** 断路器是否处于打开状态（调用方应跳过当前网关，走 fallback） */
    public boolean isCircuitOpen() {
        if (consecutiveFailures.get() < CIRCUIT_OPEN_THRESHOLD) {
            return false;
        }
        // 超过冷却期后允许半开探测
        return (System.currentTimeMillis() - lastFailureTimestamp) < COOLDOWN_MS;
    }

    /** 返回网关健康快照，用于监控面板 */
    public Map<String, Object> getHealthSnapshot() {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("configStatus", resolveStatus());
        snapshot.put("circuitState", isCircuitOpen() ? "open" : "closed");
        snapshot.put("consecutiveFailures", consecutiveFailures.get());
        snapshot.put("lastFailureTime", lastFailureTimestamp > 0 ? lastFailureTimestamp : null);
        snapshot.put("threshold", CIRCUIT_OPEN_THRESHOLD);
        snapshot.put("cooldownMs", COOLDOWN_MS);
        return snapshot;
    }

    private String resolveStatus() {
        if (!litellmEnabled) {
            return "direct-mode";
        }
        if (!hasText(litellmBaseUrl)) {
            log.warn("[IntelligenceGateway] 已启用 LiteLLM，但未配置 base-url");
            return "config-missing";
        }
        if (isCircuitOpen()) {
            return "circuit-open";
        }
        return "gateway-ready";
    }

    private String normalizeRoutingStrategy() {
        return hasText(routingStrategy) ? routingStrategy.trim().toLowerCase() : "direct";
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
