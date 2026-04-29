package com.fashion.supplychain.intelligence.gateway;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.orchestration.AiCostTrackingOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.AiOperationAuditOrchestrator;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class AiInferenceRouter implements AiInferenceGateway {

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

    @Override
    public IntelligenceInferenceResult chat(String scene, String systemPrompt, String userMessage) {
        AiInferenceGateway gateway = resolveGateway(scene);
        IntelligenceInferenceResult result = gateway.chat(scene, systemPrompt, userMessage);
        recordCostAndAudit(scene, result);
        return result;
    }

    @Override
    public IntelligenceInferenceResult chat(String scene, List<AiMessage> messages, List<AiTool> tools) {
        AiInferenceGateway gateway = resolveGateway(scene);
        IntelligenceInferenceResult result = gateway.chat(scene, messages, tools);
        recordCostAndAudit(scene, result);
        return result;
    }

    @Override
    public IntelligenceInferenceResult chatStream(String scene, List<AiMessage> messages,
                                                   List<AiTool> tools,
                                                   StreamChunkConsumer chunkConsumer) {
        AiInferenceGateway gateway = resolveGateway(scene);
        IntelligenceInferenceResult result = gateway.chatStream(scene, messages, tools, chunkConsumer);
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
        if (springAiAdapter != null && springAiAdapter.isAvailable()) {
            log.warn("[AiInferenceRouter] legacy unavailable, using spring-ai as failover");
            return springAiAdapter;
        }
        return legacyAdapter;
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
            "activeProvider", resolveGateway(null).getProviderName()
        );
    }
}
