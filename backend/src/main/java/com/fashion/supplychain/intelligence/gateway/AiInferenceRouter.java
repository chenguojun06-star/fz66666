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

    private static final int CIRCUIT_OPEN_THRESHOLD = 3;
    private static final long CIRCUIT_RESET_MS = 30_000L;

    @Value("${ai.gateway.routing-strategy:failover}")
    private String routingStrategy;

    @Autowired
    private LegacyInferenceAdapter legacyAdapter;

    @Autowired(required = false)
    private SpringAiInferenceAdapter springAiAdapter;

    @Autowired(required = false)
    private AiCostTrackingOrchestrator aiCostTrackingOrchestrator;

    @Autowired(required = false)
    private AiOperationAuditOrchestrator aiOperationAuditOrchestrator;

    @Autowired(required = false)
    private ModelConsortiumRouter modelConsortiumRouter;

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
            case "failover" -> resolveFailover(scene);
            case "legacy" -> legacyAdapter;
            default -> resolveFailover(scene);
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

    private AiInferenceGateway resolveFailover(String scene) {
        // 短查询/非Agent场景优先走 Spring AI（更快、工具调用更新）
        boolean preferSpringAi = isShortQueryScene(scene);
        if (preferSpringAi && !isSpringAiCircuitOpen()
                && springAiAdapter != null && springAiAdapter.isAvailable()) {
            log.debug("[AiInferenceRouter] 短查询场景={}，优先使用 Spring AI", scene);
            return springAiAdapter;
        }
        // Agent主循环优先Spring AI（流式+tool_calls更好），熔断时降级
        if (!isSpringAiCircuitOpen() && springAiAdapter != null && springAiAdapter.isAvailable()) {
            return springAiAdapter;
        }
        if (legacyAdapter.isAvailable()) {
            return legacyAdapter;
        }
        if (!isSpringAiCircuitOpen() && springAiAdapter != null) {
            return springAiAdapter;
        }
        return legacyAdapter;
    }

    private boolean isShortQueryScene(String scene) {
        return scene != null && (
            "nl-intent".equals(scene) || "daily-brief".equals(scene) ||
            "critic_review".equals(scene) || scene.startsWith("memory"));
    }

    private boolean isSpringAiCircuitOpen() {
        if (springAiConsecutiveFailures.get() < CIRCUIT_OPEN_THRESHOLD) return false;
        long openSince = springAiCircuitOpenSince.get();
        if (openSince > 0 && System.currentTimeMillis() - openSince > CIRCUIT_RESET_MS) {
            log.info("[AiInferenceRouter] Spring AI 熔断进入半开状态，允许探测请求");
            return false;
        }
        return openSince > 0;
    }

    private void trackSpringAiHealth(IntelligenceInferenceResult result) {
        if (result == null || !"spring-ai".equals(result.getProvider())) return;
        if (result.isSuccess()) {
            if (springAiConsecutiveFailures.get() >= CIRCUIT_OPEN_THRESHOLD) {
                log.info("[AiInferenceRouter] Spring AI 半开探测成功，熔断恢复");
            }
            springAiConsecutiveFailures.set(0);
            springAiCircuitOpenSince.set(0);
        } else {
            int failures = springAiConsecutiveFailures.incrementAndGet();
            if (failures == CIRCUIT_OPEN_THRESHOLD && springAiCircuitOpenSince.get() == 0) {
                springAiCircuitOpenSince.set(System.currentTimeMillis());
                log.warn("[AiInferenceRouter] Spring AI 连续{}次失败，熔断开启（{}秒后进入半开探测）", failures, CIRCUIT_RESET_MS / 1000);
            } else if (springAiCircuitOpenSince.get() > 0
                    && System.currentTimeMillis() - springAiCircuitOpenSince.get() > CIRCUIT_RESET_MS) {
                log.warn("[AiInferenceRouter] Spring AI 半开探测失败，重新熔断 {} 秒", CIRCUIT_RESET_MS / 1000);
                springAiCircuitOpenSince.set(System.currentTimeMillis());
            }
        }
    }

    private void recordCostAndAudit(String scene, IntelligenceInferenceResult result) {
        if (result == null) return;
        // 统一性能日志：方便排查双AI引擎表现
        log.info("[AiInference] engine={}, scene={}, success={}, latency={}ms, tokens={}/{}, fallback={}",
                result.getProvider() != null ? result.getProvider() : "unknown",
                scene != null ? scene : "default",
                result.isSuccess(),
                result.getLatencyMs(),
                result.getPromptTokens(), result.getCompletionTokens(),
                Boolean.TRUE.equals(result.isFallbackUsed()));
        if (!result.isSuccess()) {
            log.warn("[AiInference] engine={}, scene={}, error={}", result.getProvider(), scene, result.getErrorMessage());
        }
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
        Map<String, Object> status = new java.util.LinkedHashMap<>();
        status.put("strategy", routingStrategy);
        status.put("legacyAvailable", legacyAdapter.isAvailable());
        status.put("springAiAvailable", springAiAdapter != null && springAiAdapter.isAvailable());
        status.put("springAiCircuitOpen", isSpringAiCircuitOpen());
        status.put("springAiConsecutiveFailures", springAiConsecutiveFailures.get());
        status.put("activeProvider", resolveGateway(null).getProviderName());
        if (modelConsortiumRouter != null) {
            status.put("consortium", modelConsortiumRouter.getConfig());
        }
        return status;
    }

    /**
     * 模型智能路由 — 根据用户查询复杂度选择最优模型。
     * 可在上层（AiAgentOrchestrator）调用此方法获取推荐模型，传递给推理适配器。
     */
    public String recommendModel(String userMessage, boolean hasImage, int toolCount) {
        if (modelConsortiumRouter != null) {
            return modelConsortiumRouter.selectModel(userMessage, hasImage, toolCount);
        }
        return "deepseek-v4-flash";
    }

    /**
     * 获取模型推荐参数（temperature、maxTokens、timeout）。
     */
    public ModelConsortiumRouter.ModelParams recommendModelParams(String userMessage, boolean hasImage, int toolCount) {
        if (modelConsortiumRouter != null) {
            ModelConsortiumRouter.Complexity complexity = modelConsortiumRouter.classifyComplexity(
                    userMessage, hasImage, toolCount);
            return modelConsortiumRouter.getModelParams(complexity);
        }
        return new ModelConsortiumRouter.ModelParams(0.5, 1024, 30);
    }
}
