package com.fashion.supplychain.intelligence.gateway;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.orchestration.AiCostTrackingOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.AiOperationAuditOrchestrator;
import com.fashion.supplychain.intelligence.service.CostExplosionGuard;
import com.fashion.supplychain.intelligence.service.ModelSelectionRouter;
import com.fashion.supplychain.common.UserContext;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

@Slf4j
@Service
@Lazy
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

    @Autowired(required = false)
    private ModelSelectionRouter modelSelectionRouter;

    @Autowired(required = false)
    private CostExplosionGuard costExplosionGuard;

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
    public IntelligenceInferenceResult chatWithVision(String scene, String systemPrompt, String userMessage, String imageUrl) {
        // 视觉调用优先走 legacy adapter — Agnes视觉模型支持真正的image_url格式，
        // 比Spring AI适配器的文本嵌入方式更可靠
        if (legacyAdapter != null && legacyAdapter.isAvailable()) {
            try {
                IntelligenceInferenceResult result =
                        legacyAdapter.chatWithVision(scene, systemPrompt, userMessage, imageUrl);
                if (result != null && result.isSuccess() && hasText(result.getContent())) {
                    recordCostAndAudit(scene, result);
                    return result;
                }
                log.warn("[AiInferenceRouter] legacy视觉调用未返回有效内容，fallback到Spring AI");
            } catch (Exception e) {
                log.warn("[AiInferenceRouter] legacy视觉调用异常，fallback到Spring AI: {}", e.getMessage());
            }
        }
        // Spring AI 作为第二路径
        if (springAiAdapter != null && !isSpringAiCircuitOpen() && springAiAdapter.isAvailable()) {
            IntelligenceInferenceResult result = springAiAdapter.chatWithVision(scene, systemPrompt, userMessage, imageUrl);
            trackSpringAiHealth(result);
            recordCostAndAudit(scene, result);
            return result;
        }
        // 最后兜底返回空结果
        IntelligenceInferenceResult empty = new IntelligenceInferenceResult();
        empty.setSuccess(false);
        empty.setProvider("none");
        empty.setErrorMessage("没有可用的视觉模型（请配置AGNES_API_KEY或DEEPSEEK_API_KEY）");
        recordCostAndAudit(scene, empty);
        return empty;
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

    public String chatSimple(String prompt) {
        IntelligenceInferenceResult result = chat("reflection", null, prompt);
        return result != null ? result.getContent() : "";
    }

    /**
     * 带模型选择的聊天接口实现（per-call model selection）。
     *
     * <p>路由到具体的底层 gateway（SpringAiInferenceAdapter / LegacyInferenceAdapter），
     * 由底层 adapter 真正实现 per-call model 覆盖。
     * 同时记录 LLM 调用成本到 CostExplosionGuard（用于成本爆炸防御）。
     */
    @Override
    public String chatWithModel(String prompt, Long tenantId, Long userId, String modelId) {
        long start = System.currentTimeMillis();
        AiInferenceGateway gateway = resolveGateway("model-selection");
        String content;
        try {
            content = gateway.chatWithModel(prompt, tenantId, userId, modelId);
        } catch (Exception e) {
            log.warn("[AiInferenceRouter] chatWithModel failed, fallback to legacy: {}", e.getMessage());
            content = legacyAdapter.chatWithModel(prompt, tenantId, userId, modelId);
        }
        long elapsed = System.currentTimeMillis() - start;

        // 记录 LLM 调用成本到 CostExplosionGuard（用于成本爆炸防御 + 重复检测）
        if (costExplosionGuard != null && tenantId != null) {
            try {
                // 用 "llm_call" 作为 toolName，prompt 哈希作为 paramsHash
                String paramsHash = costExplosionGuard.hashParams(prompt);
                costExplosionGuard.recordToolCall(tenantId, "llm_call", paramsHash,
                        content != null ? content : "");
                log.debug("[AiInferenceRouter] LLM 调用成本已记录 tenantId={} modelId={} elapsed={}ms",
                        tenantId, modelId, elapsed);
            } catch (Exception e) {
                log.debug("[AiInferenceRouter] 记录 LLM 调用成本失败（不影响主流程）: {}", e.getMessage());
            }
        }

        log.info("[AiInferenceRouter] chatWithModel: gateway={} modelId={} elapsed={}ms contentLen={}",
                gateway.getProviderName(), modelId != null ? modelId : "default",
                elapsed, content != null ? content.length() : 0);
        return content;
    }

    /**
     * Per-call 模型选择调用（借鉴 Claude Agent SDK per-call model selection）。
     *
     * <p>根据用户消息复杂度、预估工具调用数、多域标识自动选择模型分级：
     * <ul>
     *   <li>ECONOMY — 简单查询 → 便宜模型</li>
     *   <li>STANDARD — 普通对话 → 标准模型</li>
     *   <li>PREMIUM — 复杂排产 → 强模型</li>
     * </ul>
     *
     * <p>★ 接入点3：真正调用 gateway.chatWithModel 传递 modelId，而非仅用 scene 路由。
     *
     * @param prompt              完整提示词
     * @param userMessage         用户原始消息（用于复杂度评估）
     * @param estimatedToolCalls  预估工具调用数
     * @param isMultiDomain       是否多域任务
     * @return LLM 回答文本
     */
    public String chatWithModelSelection(String prompt, String userMessage,
                                          int estimatedToolCalls, boolean isMultiDomain) {
        if (modelSelectionRouter == null || !modelSelectionRouter.isEnabled()) {
            return chatSimple(prompt);
        }
        ModelSelectionRouter.ModelTier tier = modelSelectionRouter.selectModel(
                userMessage, estimatedToolCalls, isMultiDomain);
        String modelId = modelSelectionRouter.resolveModelId(tier);
        log.info("[AiInferenceRouter] per-call model selection: tier={} modelId={}", tier, modelId);

        // 从 UserContext 获取 tenantId/userId（多租户隔离 + 成本追踪）
        Long tenantId = UserContext.tenantId();
        String userIdStr = UserContext.userId();

        // ★ 真正调用 gateway.chatWithModel 传递 modelId（接入点3 核心）
        try {
            return chatWithModel(prompt, tenantId, userIdStr != null ? userIdStr.hashCode() : 0L, modelId);
        } catch (Exception e) {
            log.warn("[AiInferenceRouter] chatWithModelSelection failed, fallback to chatSimple: {}", e.getMessage());
            return chatSimple(prompt);
        }
    }

    /**
     * 强制使用 PREMIUM 模型调用（高风险场景，如复杂排产优化）。
     *
     * @param prompt 完整提示词
     * @return LLM 回答文本
     */
    public String chatPremium(String prompt) {
        if (modelSelectionRouter == null || !modelSelectionRouter.isEnabled()) {
            return chatSimple(prompt);
        }
        String modelId = modelSelectionRouter.resolveModelId(ModelSelectionRouter.ModelTier.PREMIUM);
        log.info("[AiInferenceRouter] forced premium model: modelId={}", modelId);
        IntelligenceInferenceResult result = chat("premium-reasoning", null, prompt);
        return result != null ? result.getContent() : "";
    }

    /** 根据模型分级映射到 scene（用于网关路由 hint） */
    private String resolveSceneByTier(ModelSelectionRouter.ModelTier tier) {
        return switch (tier) {
            case ECONOMY -> "economy-query";
            case STANDARD -> "reflection";
            case PREMIUM -> "premium-reasoning";
        };
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

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
