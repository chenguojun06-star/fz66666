package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.AiToolCall;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class IntelligenceInferenceOrchestrator {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private HttpClient sharedHttpClient;

    private static final Map<String, Double> SCENE_TEMPERATURE = Map.of(
        "agent-loop", 0.3, "critic_review", 0.1, "nl-intent", 0.0,
        "daily-brief", 0.0, "memory_summarize", 0.2, "history-compact", 0.1,
        "memory-extract", 0.3
    );
    private static final double DEFAULT_TEMPERATURE = 0.3;

    private static final Map<String, Integer> SCENE_MAX_TOKENS = Map.of(
        "agent-loop", 4096, "critic_review", 1024, "nl-intent", 256,
        "daily-brief", 512, "memory_summarize", 256, "history-compact", 256,
        "memory-extract", 256
    );
    private static final int DEFAULT_MAX_TOKENS = 2048;

    private static final int MIN_TIMEOUT_SECONDS = 5;
    private static final int DEFAULT_MAX_TIMEOUT_SECONDS = 60;
    private static final int AI_ADVISOR_MAX_TIMEOUT_SECONDS = 20;
    private static final int NL_INTENT_MAX_TIMEOUT_SECONDS = 12;
    private static final int DAILY_BRIEF_MAX_TIMEOUT_SECONDS = 5;
    private static final int CRITIC_REVIEW_MAX_TIMEOUT_SECONDS = 30;

    @Value("${ai.deepseek.api-key:}") private String directApiKey;
    @Value("${ai.deepseek.api-url:https://api.deepseek.com/v1/chat/completions}") private String directApiUrl;
    @Value("${ai.deepseek.model:deepseek-v4-flash}") private String directModel;
    @Value("${ai.deepseek.timeout-seconds:90}") private int directTimeoutSeconds;
    @Value("${ai.doubao.api-key:}") private String doubaoApiKey;
    @Value("${ai.doubao.api-url:https://ark.cn-beijing.volces.com/api/v3/chat/completions}") private String doubaoApiUrl;
    @Value("${ai.doubao.model:doubao-1-5-vision-pro-32k-250115}") private String doubaoModel;
    @Value("${ai.doubao.timeout-seconds:60}") private int doubaoTimeoutSeconds;
    @Value("${ai.gateway.litellm.api-key:}") private String litellmApiKey;
    @Value("${ai.gateway.litellm.timeout-seconds:30}") private int gatewayTimeoutSeconds;
    @Value("${ai.fallback.qwen.api-key:}") private String qwenApiKey;
    @Value("${ai.fallback.qwen.api-url:https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions}") private String qwenApiUrl;
    @Value("${ai.fallback.qwen.model:qwen-plus}") private String qwenModel;
    @Value("${ai.fallback.qwen.timeout-seconds:30}") private int qwenTimeoutSeconds;
    @Value("${ai.fallback.keyword-enabled:true}") private boolean keywordFallbackEnabled;

    @Autowired private IntelligenceModelGatewayOrchestrator intelligenceModelGatewayOrchestrator;
    @Autowired private IntelligenceObservabilityOrchestrator intelligenceObservabilityOrchestrator;
    @Autowired private com.fashion.supplychain.intelligence.service.AiAgentTokenBudgetService aiAgentTokenBudgetService;

    @PostConstruct
    public void initHttpClient() {
        sharedHttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    public IntelligenceInferenceResult chat(String scene, String systemPrompt, String userMessage) {
        List<AiMessage> msgs = new ArrayList<>();
        msgs.add(AiMessage.system(systemPrompt));
        msgs.add(AiMessage.user(userMessage));
        return chat(scene, msgs, null);
    }

    public IntelligenceInferenceResult chat(String scene, List<AiMessage> messages, List<AiTool> tools) {
        long start = System.currentTimeMillis();
        String traceId = UUID.randomUUID().toString();

        if (!aiAgentTokenBudgetService.canInvoke()) {
            return buildQuotaExceededResult(traceId, start);
        }

        IntelligenceInferenceResult result;
        if (intelligenceModelGatewayOrchestrator.isGatewayReady()
                && !intelligenceModelGatewayOrchestrator.isCircuitOpen()) {
            result = invokeLitellm(scene, messages, tools, traceId);
            if (result.isSuccess()) {
                intelligenceModelGatewayOrchestrator.recordSuccess();
            } else {
                intelligenceModelGatewayOrchestrator.recordFailure();
                if (intelligenceModelGatewayOrchestrator.isFallbackEnabled()) {
                    IntelligenceInferenceResult fallback = invokeDirect(scene, messages, tools, traceId);
                    fallback.setFallbackUsed(true);
                    result = fallback;
                }
            }
        } else {
            result = invokeDirect(scene, messages, tools, traceId);
        }

        if (!result.isSuccess() && hasText(qwenApiKey)) {
            log.info("[IntelligenceInference] 主模型失败，尝试Qwen备用模型 scene={}", scene);
            IntelligenceInferenceResult qwenResult = invokeQwen(scene, messages, tools, traceId);
            if (qwenResult.isSuccess()) {
                qwenResult.setFallbackUsed(true);
                result = qwenResult;
            }
        }

        if (!result.isSuccess() && keywordFallbackEnabled) {
            log.info("[IntelligenceInference] 所有模型失败，启用关键词兜底 scene={}", scene);
            result = invokeKeywordFallback(scene, messages, traceId, start);
        }

        finalizeResult(result, traceId, start, messages, scene);
        return result;
    }

    public boolean isAnyModelEnabled() {
        return intelligenceModelGatewayOrchestrator.isGatewayReady() || hasText(directApiKey);
    }

    @FunctionalInterface
    public interface StreamChunkConsumer {
        void accept(String chunk, boolean isDone);
    }

    public IntelligenceInferenceResult chatStream(String scene, List<AiMessage> messages,
            List<AiTool> tools, StreamChunkConsumer chunkConsumer) {
        long start = System.currentTimeMillis();
        String traceId = UUID.randomUUID().toString();

        if (!aiAgentTokenBudgetService.canInvoke()) {
            return buildQuotaExceededResult(traceId, start);
        }

        StreamConfig cfg = resolveStreamConfig();
        IntelligenceInferenceResult result = new IntelligenceInferenceResult();
        result.setProvider("stream");
        result.setModel(cfg.model);
        result.setTraceId(traceId);

        if (!hasText(cfg.endpoint) || !hasText(cfg.apiKey)) {
            result.setSuccess(false);
            result.setErrorMessage("endpoint-or-key-missing");
            return result;
        }

        try {
            HttpRequest request = buildStreamHttpRequest(scene, cfg, messages, tools, traceId);
            StreamAccumulator acc = new StreamAccumulator();
            HttpResponse<java.util.stream.Stream<String>> response =
                    sharedHttpClient.send(request, HttpResponse.BodyHandlers.ofLines());

            if (response.statusCode() != 200) {
                result.setSuccess(false);
                result.setErrorMessage("http-" + response.statusCode());
                readStreamErrorBody(response, result);
                return result;
            }

            parseStreamLines(response.body(), acc, chunkConsumer);
            assembleStreamToolCalls(acc, result);
            finalizeStreamResult(result, acc, start, messages, scene);
        } catch (Exception e) {
            result.setSuccess(false);
            result.setErrorMessage(e.getClass().getSimpleName() + ": " + e.getMessage());
            log.warn("[StreamInference] 流式调用失败: {}", e.getMessage());
        }
        return result;
    }

    public boolean isVisionEnabled() {
        if (!hasText(doubaoApiKey)) log.warn("[Vision] Doubao 未配置，视觉分析不可用");
        return hasText(doubaoApiKey);
    }

    public String chatWithDoubaoVision(String imageUrl, String textPrompt) {
        if (!hasText(doubaoApiKey) || !hasText(imageUrl)) {
            log.warn("[DoubaoVision] 缺少必要参数：apiKey 或 imageUrl 为空");
            return null;
        }
        try {
            if (imageUrl.startsWith("data:") && imageUrl.length() > 8 * 1024 * 1024) {
                log.warn("[DoubaoVision] Base64 数据URI超过8MB({}MB)，已跳过", imageUrl.length() / 1024 / 1024);
                return null;
            }
            log.info("[DoubaoVision] 发送请求 类型={} 长度={}字符",
                    imageUrl.startsWith("data:") ? "base64" : imageUrl.startsWith("http") ? "http-url" : "other",
                    imageUrl.length());
            String payload = buildDoubaoVisionPayload(imageUrl, textPrompt);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(doubaoApiUrl))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + doubaoApiKey)
                    .timeout(Duration.ofSeconds(doubaoTimeoutSeconds))
                    .POST(HttpRequest.BodyPublishers.ofString(payload))
                    .build();
            HttpResponse<String> response = sharedHttpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return extractDoubaoVisionResponse(response);
        } catch (Exception e) {
            log.warn("[DoubaoVision] 图像分析异常: {}", e.getMessage());
        }
        return null;
    }

    // ==================== 私有方法 ====================

    private record StreamConfig(String endpoint, String apiKey, String model, int timeout) {}

    private StreamConfig resolveStreamConfig() {
        String endpoint = directApiUrl;
        String apiKey = directApiKey;
        String model = directModel;
        int timeout = directTimeoutSeconds;
        if (intelligenceModelGatewayOrchestrator.isGatewayReady()
                && !intelligenceModelGatewayOrchestrator.isCircuitOpen()) {
            endpoint = normalizeChatCompletionsUrl(intelligenceModelGatewayOrchestrator.getGatewayBaseUrl());
            apiKey = litellmApiKey;
            model = intelligenceModelGatewayOrchestrator.getActiveModelName();
            timeout = gatewayTimeoutSeconds;
        }
        return new StreamConfig(endpoint, apiKey, model, timeout);
    }

    private HttpRequest buildStreamHttpRequest(String scene, StreamConfig cfg,
            List<AiMessage> messages, List<AiTool> tools, String traceId) throws Exception {
        String body = buildStreamRequestBody(scene, cfg.model, messages, tools);
        int effectiveTimeout = Math.max(Math.min(cfg.timeout, DEFAULT_MAX_TIMEOUT_SECONDS), MIN_TIMEOUT_SECONDS);
        return HttpRequest.newBuilder()
                .uri(URI.create(cfg.endpoint))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + cfg.apiKey)
                .header("X-Trace-Id", traceId)
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .timeout(Duration.ofSeconds(effectiveTimeout))
                .build();
    }

    private String buildStreamRequestBody(String scene, String model,
            List<AiMessage> messages, List<AiTool> tools) throws Exception {
        var root = MAPPER.createObjectNode();
        String actualModel = model;
        String thinkingMode = null;
        if (model != null && model.contains(":thinking")) {
            actualModel = model.replace(":thinking", "");
            thinkingMode = "thinking";
        }
        root.put("model", actualModel);
        root.put("temperature", SCENE_TEMPERATURE.getOrDefault(scene, DEFAULT_TEMPERATURE));
        root.put("max_tokens", SCENE_MAX_TOKENS.getOrDefault(scene, DEFAULT_MAX_TOKENS));
        root.put("stream", true);
        root.set("messages", MAPPER.valueToTree(messages));
        if (tools != null && !tools.isEmpty()) root.set("tools", MAPPER.valueToTree(tools));
        if (thinkingMode != null) root.put("thinking_mode", thinkingMode);
        return MAPPER.writeValueAsString(root);
    }

    private void readStreamErrorBody(HttpResponse<java.util.stream.Stream<String>> response,
            IntelligenceInferenceResult result) {
        try {
            String body = response.body() != null
                    ? response.body().limit(10).reduce("", (a, b) -> a + b)
                    : "";
            log.warn("[StreamInference] 非200响应 body={}", body.length() > 500 ? body.substring(0, 500) : body);
        } catch (Exception ignored) {
        }
    }

    private static class StreamAccumulator {
        final StringBuilder fullContent = new StringBuilder();
        final List<AiToolCall> toolCalls = new ArrayList<>();
        final Map<Integer, StringBuilder> toolCallArgs = new HashMap<>();
        final Map<Integer, String> toolCallNames = new HashMap<>();
        final Map<Integer, String> toolCallIds = new HashMap<>();
    }

    private void parseStreamLines(java.util.stream.Stream<String> lines,
            StreamAccumulator acc, StreamChunkConsumer chunkConsumer) {
        lines.forEach(line -> {
            if (line == null || !line.startsWith("data: ")) return;
            String data = line.substring(6).trim();
            if ("[DONE]".equals(data)) return;
            try {
                JsonNode chunk = MAPPER.readTree(data);
                JsonNode choices = chunk.path("choices");
                if (!choices.isArray() || choices.isEmpty()) return;
                JsonNode delta = choices.get(0).path("delta");
                String finishReason = choices.get(0).path("finish_reason").asText(null);

                String content = delta.path("content").asText(null);
                if (content != null && !content.isEmpty()) {
                    acc.fullContent.append(content);
                    if (chunkConsumer != null) chunkConsumer.accept(content, false);
                }

                if (delta.has("tool_calls")) {
                    for (JsonNode tc : delta.path("tool_calls")) {
                        int idx = tc.path("index").asInt();
                        if (tc.has("function")) {
                            String name = tc.path("function").path("name").asText(null);
                            String argsChunk = tc.path("function").path("arguments").asText(null);
                            String id = tc.path("id").asText(null);
                            if (id != null) acc.toolCallIds.put(idx, id);
                            if (name != null) acc.toolCallNames.put(idx, name);
                            if (argsChunk != null) acc.toolCallArgs.computeIfAbsent(idx, k -> new StringBuilder()).append(argsChunk);
                        }
                    }
                }

                if ("stop".equals(finishReason) || "tool_calls".equals(finishReason)) {
                    if (chunkConsumer != null) chunkConsumer.accept("", true);
                }
            } catch (Exception e) {
                log.debug("[StreamInference] 解析chunk失败: {}", e.getMessage());
            }
        });
    }

    private void assembleStreamToolCalls(StreamAccumulator acc, IntelligenceInferenceResult result) {
        if (acc.toolCallNames.isEmpty()) return;
        for (int i = 0; i < acc.toolCallNames.size(); i++) {
            AiToolCall tc = new AiToolCall();
            tc.setId(acc.toolCallIds.getOrDefault(i, "tc_" + i));
            AiToolCall.AiFunctionCall fn = new AiToolCall.AiFunctionCall();
            fn.setName(acc.toolCallNames.get(i));
            fn.setArguments(acc.toolCallArgs.getOrDefault(i, new StringBuilder()).toString());
            tc.setFunction(fn);
            acc.toolCalls.add(tc);
        }
        result.setToolCalls(acc.toolCalls);
        result.setToolCallCount(acc.toolCalls.size());
    }

    private void finalizeStreamResult(IntelligenceInferenceResult result, StreamAccumulator acc,
            long start, List<AiMessage> messages, String scene) {
        result.setContent(acc.fullContent.toString());
        result.setSuccess(true);
        result.setLatencyMs(System.currentTimeMillis() - start);
        result.setPromptChars(length(messages.toString()));
        result.setResponseChars(acc.fullContent.length());
        int estimatedPrompt = result.getPromptChars() / 4;
        int estimatedCompletion = result.getResponseChars() / 2;
        result.setPromptTokens(estimatedPrompt);
        result.setCompletionTokens(estimatedCompletion);
        aiAgentTokenBudgetService.recordUsage(estimatedPrompt, estimatedCompletion);
        intelligenceObservabilityOrchestrator.recordInvocation(scene, result, UserContext.tenantId(), UserContext.userId());
    }

    private IntelligenceInferenceResult invokeLitellm(String scene, List<AiMessage> messages,
            List<AiTool> tools, String traceId) {
        String baseUrl = intelligenceModelGatewayOrchestrator.getGatewayBaseUrl();
        String model = intelligenceModelGatewayOrchestrator.getActiveModelName();
        String endpoint = normalizeChatCompletionsUrl(baseUrl);
        return invokeOpenAiCompatible(scene, "litellm", endpoint, litellmApiKey, model, messages, tools, gatewayTimeoutSeconds, traceId);
    }

    private IntelligenceInferenceResult invokeDirect(String scene, List<AiMessage> messages,
            List<AiTool> tools, String traceId) {
        return invokeOpenAiCompatible(scene, "direct", directApiUrl, directApiKey, directModel, messages, tools, directTimeoutSeconds, traceId);
    }

    private IntelligenceInferenceResult invokeQwen(String scene, List<AiMessage> messages,
            List<AiTool> tools, String traceId) {
        return invokeOpenAiCompatible(scene, "qwen-fallback", qwenApiUrl, qwenApiKey, qwenModel, messages, tools, qwenTimeoutSeconds, traceId);
    }

    private IntelligenceInferenceResult invokeKeywordFallback(String scene, List<AiMessage> messages,
            String traceId, long start) {
        IntelligenceInferenceResult result = new IntelligenceInferenceResult();
        result.setProvider("keyword-fallback");
        result.setModel("rule-engine");
        result.setTraceId(traceId);
        result.setFallbackUsed(true);
        result.setLatencyMs(System.currentTimeMillis() - start);

        String lastUserMsg = messages.stream()
                .filter(m -> "user".equals(m.getRole()))
                .map(AiMessage::getContent)
                .reduce((first, second) -> second)
                .orElse("");

        String fallbackAnswer = matchKeywordIntent(lastUserMsg);
        if (fallbackAnswer != null) {
            result.setContent(fallbackAnswer);
            result.setSuccess(true);
        } else {
            result.setSuccess(false);
            result.setErrorMessage("all-models-unavailable");
            result.setContent("AI 服务暂时不可用，请稍后重试或联系管理员。");
        }
        return result;
    }

    private String matchKeywordIntent(String userMessage) {
        if (userMessage == null || userMessage.isBlank()) return null;
        String msg = userMessage.toLowerCase();
        if (msg.contains("订单") && (msg.contains("进度") || msg.contains("状态")))
            return "正在为您查询订单进度，请稍候…";
        if (msg.contains("延期") || msg.contains("逾期"))
            return "正在为您分析延期订单，请稍候…";
        if (msg.contains("扫码") || msg.contains("产量"))
            return "正在为您统计扫码数据，请稍候…";
        if (msg.contains("工资") || msg.contains("结算"))
            return "正在为您汇总结算信息，请稍候…";
        if (msg.contains("库存") || msg.contains("入库"))
            return "正在为您查询库存信息，请稍候…";
        if (msg.contains("瓶颈") || msg.contains("堵塞"))
            return "正在为您分析瓶颈数据，请稍候…";
        if (msg.contains("帮助") || msg.contains("怎么"))
            return "您可以问我关于订单进度、扫码统计、工资结算、库存查询等问题。";
        return null;
    }

    private IntelligenceInferenceResult invokeOpenAiCompatible(String scene, String provider,
            String endpoint, String apiKey, String model, List<AiMessage> messages,
            List<AiTool> tools, int timeoutSeconds, String traceId) {
        IntelligenceInferenceResult result = new IntelligenceInferenceResult();
        result.setProvider(provider);
        result.setModel(model);
        result.setTraceId(traceId);
        if (!hasText(endpoint)) { result.setSuccess(false); result.setErrorMessage("endpoint-missing"); return result; }
        if (!hasText(apiKey)) { result.setSuccess(false); result.setErrorMessage("api-key-missing"); return result; }

        int effectiveTimeout = resolveEffectiveTimeoutSeconds(scene, timeoutSeconds);
        boolean allowRetry = !"ai-advisor".equals(scene) && !"nl-intent".equals(scene) && !"daily-brief".equals(scene);

        try {
            HttpRequest request = buildHttpRequest(endpoint, apiKey, model, scene, messages, tools, traceId, effectiveTimeout);
            HttpResponse<String> response = sharedHttpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) { result.setSuccess(true); extractResponse(response.body(), result); return result; }
            if (allowRetry && response.statusCode() >= 500) {
                log.warn("[IntelligenceInference] {} 返回 {}，指数退避后重试", provider, response.statusCode());
                IntelligenceInferenceResult retryResult = retryOnce(request, result, provider);
                if (retryResult != null) return retryResult;
            }
            result.setSuccess(false);
            result.setErrorMessage("http-" + response.statusCode());
            log.warn("[IntelligenceInference] {} 调用失败 status={} body={}", provider, response.statusCode(),
                    response.body().substring(0, Math.min(200, response.body().length())));
            return result;
        } catch (Exception e) {
            return handleInvocationException(e, result, provider, scene, allowRetry, endpoint, apiKey, model, messages, tools, traceId, effectiveTimeout);
        }
    }

    private IntelligenceInferenceResult handleInvocationException(Exception e, IntelligenceInferenceResult result,
            String provider, String scene, boolean allowRetry, String endpoint, String apiKey, String model,
            List<AiMessage> messages, List<AiTool> tools, String traceId, int effectiveTimeout) {
        boolean isRetryable = isRetryableError(e);
        if (!isRetryable || !allowRetry) {
            result.setSuccess(false);
            result.setErrorMessage(e.getClass().getSimpleName() + ": " + e.getMessage());
            log.warn("[IntelligenceInference] {} 场景={} 异常(不重试): {}", provider, scene, e.getMessage());
            return result;
        }
        log.warn("[IntelligenceInference] {} 场景={} 可恢复异常，指数退避后重试: {}", provider, scene, e.getMessage());
        try {
            Thread.sleep(1000 + (long)(Math.random() * 500));
            HttpRequest retryRequest = buildHttpRequest(endpoint, apiKey, model, scene, messages, tools, traceId, effectiveTimeout);
            IntelligenceInferenceResult retryResult = retryOnce(retryRequest, result, provider);
            if (retryResult != null) return retryResult;
        } catch (Exception retryEx) {
            result.setSuccess(false);
            result.setErrorMessage("重试仍失败: " + retryEx.getClass().getSimpleName());
            log.warn("[IntelligenceInference] {} 重试也失败: {}", provider, retryEx.getMessage());
        }
        return result;
    }

    private IntelligenceInferenceResult retryOnce(HttpRequest request, IntelligenceInferenceResult result, String provider) {
        try {
            HttpResponse<String> retryResp = sharedHttpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (retryResp.statusCode() == 200) {
                result.setSuccess(true);
                extractResponse(retryResp.body(), result);
                log.info("[IntelligenceInference] {} 重试成功", provider);
                return result;
            }
            result.setSuccess(false);
            result.setErrorMessage("retry-http-" + retryResp.statusCode());
        } catch (Exception retryEx) {
            result.setSuccess(false);
            result.setErrorMessage("重试失败: " + retryEx.getClass().getSimpleName());
        }
        return null;
    }

    private HttpRequest buildHttpRequest(String endpoint, String apiKey, String model, String scene,
            List<AiMessage> messages, List<AiTool> tools, String traceId, int effectiveTimeout) throws Exception {
        String body = buildRequestBody(scene, model, messages, tools);
        return HttpRequest.newBuilder()
                .uri(URI.create(endpoint))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .header("X-Trace-Id", traceId)
                .header("X-Request-Id", traceId)
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .timeout(Duration.ofSeconds(effectiveTimeout))
                .build();
    }

    private IntelligenceInferenceResult buildQuotaExceededResult(String traceId, long start) {
        IntelligenceInferenceResult r = new IntelligenceInferenceResult();
        r.setSuccess(false);
        r.setErrorMessage("tenant-daily-token-quota-exceeded");
        r.setContent("当前租户今日 AI 调用已达上限（" + aiAgentTokenBudgetService.getDailyLimit() + " tokens），请明日再试或联系管理员调整额度。");
        r.setTraceId(traceId);
        r.setLatencyMs(System.currentTimeMillis() - start);
        return r;
    }

    private void finalizeResult(IntelligenceInferenceResult result, String traceId, long start,
            List<AiMessage> messages, String scene) {
        result.setTraceId(traceId);
        result.setTraceUrl(intelligenceObservabilityOrchestrator.buildTraceUrl(traceId));
        result.setLatencyMs(Math.max(0, System.currentTimeMillis() - start));
        result.setPromptChars(length(messages.toString()));
        result.setResponseChars(length(result.getContent()));
        intelligenceObservabilityOrchestrator.recordInvocation(scene, result, UserContext.tenantId(), UserContext.userId());
        aiAgentTokenBudgetService.recordUsage(result.getPromptTokens(), result.getCompletionTokens());
    }

    private String extractDoubaoVisionResponse(HttpResponse<String> response) throws Exception {
        String body = response.body();
        if (response.statusCode() == 200) {
            JsonNode root = MAPPER.readTree(body);
            if (root.has("choices") && root.get("choices").size() > 0) {
                String content = root.get("choices").get(0).get("message").get("content").asText();
                log.debug("[DoubaoVision] 调用成功，content长度={}", content.length());
                return content;
            }
            log.warn("[DoubaoVision] 响应格式异常: {}", body);
        } else if (response.statusCode() == 404 && body.contains("InvalidEndpointOrModel")) {
            log.error("[DoubaoVision] 模型端点无效(404): model={} — 请在 Volcengine ARK 控制台开通该模型。错误: {}",
                    doubaoModel, body.substring(0, Math.min(300, body.length())));
        } else {
            log.warn("[DoubaoVision] 调用失败 status={} body={}", response.statusCode(),
                    body.substring(0, Math.min(200, body.length())));
        }
        return null;
    }

    private int resolveEffectiveTimeoutSeconds(String scene, int configuredTimeoutSeconds) {
        int raw = Math.max(configuredTimeoutSeconds, MIN_TIMEOUT_SECONDS);
        int cap = DEFAULT_MAX_TIMEOUT_SECONDS;
        if ("ai-advisor".equals(scene)) cap = AI_ADVISOR_MAX_TIMEOUT_SECONDS;
        else if ("nl-intent".equals(scene)) cap = NL_INTENT_MAX_TIMEOUT_SECONDS;
        else if ("daily-brief".equals(scene)) cap = DAILY_BRIEF_MAX_TIMEOUT_SECONDS;
        else if ("critic_review".equals(scene)) cap = CRITIC_REVIEW_MAX_TIMEOUT_SECONDS;
        int effective = Math.min(raw, cap);
        if (effective != raw) log.info("[IntelligenceInference] 场景={} 超时封顶: {}s -> {}s", scene, raw, effective);
        return effective;
    }

    private String buildRequestBody(String scene, String model, List<AiMessage> messages, List<AiTool> tools) throws Exception {
        var root = MAPPER.createObjectNode();
        String actualModel = model;
        String thinkingMode = null;
        if (model != null && model.contains(":thinking")) {
            actualModel = model.replace(":thinking", "");
            thinkingMode = "thinking";
        }
        root.put("model", actualModel);
        root.put("temperature", SCENE_TEMPERATURE.getOrDefault(scene, DEFAULT_TEMPERATURE));
        root.put("max_tokens", SCENE_MAX_TOKENS.getOrDefault(scene, DEFAULT_MAX_TOKENS));
        root.set("messages", MAPPER.valueToTree(messages));
        if (tools != null && !tools.isEmpty()) root.set("tools", MAPPER.valueToTree(tools));
        if (thinkingMode != null) root.put("thinking_mode", thinkingMode);
        return MAPPER.writeValueAsString(root);
    }

    private void extractResponse(String responseBody, IntelligenceInferenceResult result) throws Exception {
        JsonNode root = MAPPER.readTree(responseBody);
        JsonNode choices = root.path("choices");
        if (!choices.isArray() || choices.isEmpty()) {
            log.warn("[IntelligenceInference] API 返回空 choices: {}",
                    responseBody.substring(0, Math.min(200, responseBody.length())));
            result.setContent(null);
            return;
        }
        JsonNode message = choices.get(0).path("message");
        result.setContent(message.path("content").asText(null));
        JsonNode usage = root.path("usage");
        if (!usage.isMissingNode()) {
            result.setPromptTokens(usage.path("prompt_tokens").asInt(0));
            result.setCompletionTokens(usage.path("completion_tokens").asInt(0));
        }
        if (message.has("tool_calls")) {
            List<AiToolCall> toolCalls = MAPPER.convertValue(message.path("tool_calls"), new TypeReference<List<AiToolCall>>(){});
            result.setToolCalls(toolCalls);
            result.setToolCallCount(toolCalls == null ? 0 : toolCalls.size());
        }
    }

    private String normalizeChatCompletionsUrl(String baseUrl) {
        if (!hasText(baseUrl)) return null;
        String value = baseUrl.trim();
        if (value.endsWith("/chat/completions")) return value;
        if (value.endsWith("/")) return value + "chat/completions";
        return value + "/chat/completions";
    }

    private String buildDoubaoVisionPayload(String imageUrl, String textPrompt) throws Exception {
        var root = MAPPER.createObjectNode();
        root.put("model", doubaoModel);
        var messagesArr = root.putArray("messages");
        var userMsg = messagesArr.addObject();
        userMsg.put("role", "user");
        var content = userMsg.putArray("content");
        var imgPart = content.addObject();
        imgPart.put("type", "image_url");
        imgPart.putObject("image_url").put("url", imageUrl);
        var textPart = content.addObject();
        textPart.put("type", "text");
        textPart.put("text", textPrompt);
        return MAPPER.writeValueAsString(root);
    }

    private boolean isRetryableError(Exception e) {
        if (e instanceof java.net.http.HttpTimeoutException) return true;
        if (e instanceof java.net.ConnectException) return true;
        if (e instanceof java.io.IOException) return true;
        return false;
    }

    private int length(String value) { return value == null ? 0 : value.length(); }
    private boolean hasText(String value) { return value != null && !value.trim().isEmpty(); }
}
