package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.IntelligenceBrainSnapshotResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * 智能模型网关编排器。
 *
 * <p>职责：统一暴露当前 AI 调用出口的治理状态，
 * 为后续 LiteLLM/Ollama/兼容 OpenAI 网关接入提供独立边界。</p>
 */
@Service
@Slf4j
public class IntelligenceModelGatewayOrchestrator {

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

    private String resolveStatus() {
        if (!litellmEnabled) {
            return "direct-mode";
        }
        if (!hasText(litellmBaseUrl)) {
            log.warn("[IntelligenceGateway] 已启用 LiteLLM，但未配置 base-url");
            return "config-missing";
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
