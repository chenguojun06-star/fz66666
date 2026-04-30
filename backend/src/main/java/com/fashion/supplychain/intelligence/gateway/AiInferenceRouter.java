package com.fashion.supplychain.intelligence.gateway;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.orchestration.AiCostTrackingOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.AiOperationAuditOrchestrator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@Primary
public class AiInferenceRouter implements AiInferenceGateway {

    private static final int CIRCUIT_OPEN_THRESHOLD = 5;
    private static final long CIRCUIT_RESET_MS = 60_000L;

    @Value("${ai.gateway.routing-strategy:legacy}")
    private String routingStrategy;

    @Autowired
    private LegacyInferenceAdapter legacyAdapter;

    @Autowired(required = false)
    private SpringAiInferenceAdapter springAiAdapter;

    @Autowired(required = false)
    private AiCostTrackingOrchestrator aiCostTrackingOrchestrator;

    @Autowired(required = false)
    private AiOperationAuditOrchestrator aiOperationAuditOrchestrator;

    private final AtomicInteger springAiConsecutiveFailures = new AtomicInteger(0);
    private final AtomicLong springAiCircuitOpenSince = new AtomicLong(0);

    @Override
    public IntelligenceInferenceResult chat(String scene, String systemPrompt, String userMessage) {
        AiInferenceGateway gateway = resolveGateway(scene);
        IntelligenceInferenceResult result = gateway.chat(scene, systemPrompt, userMessage);
        trackSpringAiHealth(result);
        if (isSpringAiCircuitOpen() && !"legacy".equals(gateway.getProviderName())) {
            log.info("[AiInferenceRouter] Spring AI 熔断触发，降级到 legacy 重试 scene={}", scene);
            result = legacyAdapter.chat(scene, systemPrompt, userMessage);
            result.setFallbackUsed(true);
        }
        recordCostAndAudit(scene, result);
        return result;
    }

    @Override
    public IntelligenceInferenceResult chat(String scene, List<AiMessage> messages, List<AiTool> tools) {
        AiInferenceGateway gateway = resolveGateway(scene);
        IntelligenceInferenceResult result = gateway.chat(scene, messages, tools);
        trackSpringAiHealth(result);
        if (isSpringAiCircuitOpen() && !"legacy".equals(gateway.getProviderName())) {
            log.info("[AiInferenceRouter] Spring AI 熔断触发，降级到 legacy 重试 scene={}", scene);
            result = legacyAdapter.chat(scene, messages, tools);
            result.setFallbackUsed(true);
        }
        recordCostAndAudit(scene, result);
        return result;
    }

    @Override
    public IntelligenceInferenceResult chatStream(String scene, List<AiMessage> messages,
                                                   List<AiTool> tools,
                                                   StreamChunkConsumer chunkConsumer) {
        AiInferenceGateway gateway = resolveGateway(scene);
        IntelligenceInferenceResult result = gateway.chatStream(scene, messages, tools, chunkConsumer);
        trackSpringAiHealth(result);
        if (isSpringAiCircuitOpen() && !"legacy".equals(gateway.getProviderName())) {
            log.info("[AiInferenceRouter] Spring AI 熔断触发，降级到 legacy 重试 scene={}", scene);
            result = legacyAdapter.chatStream(scene, messages, tools, chunkConsumer);
            result.setFallbackUsed(true);
        }
        recordCostAndAudit(scene, result);
        return result;
    }

    @Override
    public boolean isAvailable() {
        return resolveGateway(null).isAvailable();
    }

    @Override
    public String getProviderName() {
        return resolveGateway(null).getProviderName();
    }

    private AiInferenceGateway resolveGateway(String scene) {
        return switch (routingStrategy) {
            case "spring-ai" -> resolveSpringAi();
            case "failover" -> resolveFailover();
            case "legacy" -> legacyAdapter;
            default -> legacyAdapter;
        };
    }

    private AiInferenceGateway resolveSpringAi() {
        if (isSpringAiCircuitOpen()) {
            log.warn("[AiInferenceRouter] Spring AI 熔断中，降级到 legacy");
            return legacyAdapter;
        }
        if (springAiAdapter != null && springAiAdapter.isAvailable()) {
            return springAiAdapter;
        }
        log.warn("[AiInferenceRouter] spring-ai unavailable, falling back to legacy");
        return legacyAdapter;
    }

    private AiInferenceGateway resolveFailover() {
        if (legacyAdapter.isAvailable()) {
            return legacyAdapter;
        }
        if (!isSpringAiCircuitOpen() && springAiAdapter != null && springAiAdapter.isAvailable()) {
            log.warn("[AiInferenceRouter] legacy unavailable, using spring-ai as failover");
            return springAiAdapter;
        }
        return legacyAdapter;
    }

    private boolean isSpringAiCircuitOpen() {
        if (springAiConsecutiveFailures.get() < CIRCUIT_OPEN_THRESHOLD) return false;
        long openSince = springAiCircuitOpenSince.get();
        if (openSince > 0 && System.currentTimeMillis() - openSince > CIRCUIT_RESET_MS) {
            springAiConsecutiveFailures.set(0);
            springAiCircuitOpenSince.set(0);
            log.info("[AiInferenceRouter] Spring AI 熔断恢复（{}秒冷却期已过）", CIRCUIT_RESET_MS / 1000);
            return false;
        }
        return true;
    }

    private void trackSpringAiHealth(IntelligenceInferenceResult result) {
        if (result == null || !"spring-ai".equals(result.getProvider())) return;
        if (result.isSuccess()) {
            springAiConsecutiveFailures.set(0);
            springAiCircuitOpenSince.set(0);
        } else {
            int failures = springAiConsecutiveFailures.incrementAndGet();
            if (failures >= CIRCUIT_OPEN_THRESHOLD && springAiCircuitOpenSince.compareAndSet(0, System.currentTimeMillis())) {
                log.warn("[AiInferenceRouter] Spring AI 连续{}次失败，熔断开启（{}秒后自动恢复尝试）", failures, CIRCUIT_RESET_MS / 1000);
            }
        }
    }

    private void recordCostAndAudit(String scene, IntelligenceInferenceResult result) {
        if (result == null) return;
        try {
            if (aiCostTrackingOrchestrator != null) {
                aiCostTrackingOrchestrator.recordAsync(
                        result.getModel() != null ? result.getModel() : result.getProvider(),
                        scene,
                        result.getPromptTokens(),
                        result.getCompletionTokens(),
                        (int) result.getLatencyMs(),
                        result.isSuccess(),
                        result.getErrorMessage()
                );
            }
        } catch (Exception e) {
            log.debug("[AiInferenceRouter] cost tracking failed: {}", e.getMessage());
        }
        try {
            if (aiOperationAuditOrchestrator != null && result.getTraceId() != null) {
                aiOperationAuditOrchestrator.recordAudit(
                        result.getTraceId(),
                        "inference:" + scene,
                        result.getPromptChars() + " chars",
                        result.getResponseChars() + " chars",
                        result.getLatencyMs(),
                        result.isSuccess(),
                        result.getErrorMessage()
                );
            }
        } catch (Exception e) {
            log.debug("[AiInferenceRouter] audit recording failed: {}", e.getMessage());
        }
    }

    public Map<String, Object> getRoutingStatus() {
        return Map.of(
            "strategy", routingStrategy,
            "legacyAvailable", legacyAdapter.isAvailable(),
            "springAiAvailable", springAiAdapter != null && springAiAdapter.isAvailable(),
            "springAiCircuitOpen", isSpringAiCircuitOpen(),
            "springAiConsecutiveFailures", springAiConsecutiveFailures.get(),
            "activeProvider", resolveGateway(null).getProviderName()
        );
    }
}
