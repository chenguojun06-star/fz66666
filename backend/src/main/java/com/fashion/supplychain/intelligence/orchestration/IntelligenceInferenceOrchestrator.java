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
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class IntelligenceInferenceOrchestrator {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int MIN_TIMEOUT_SECONDS = 5;
    private static final int DEFAULT_MAX_TIMEOUT_SECONDS = 60;
    private static final int AI_ADVISOR_MAX_TIMEOUT_SECONDS = 20;
    private static final int NL_INTENT_MAX_TIMEOUT_SECONDS = 12;

    @Value("${ai.deepseek.api-key:}")
    private String directApiKey;

    @Value("${ai.deepseek.api-url:https://api.deepseek.com/v1/chat/completions}")
    private String directApiUrl;

    @Value("${ai.deepseek.model:deepseek-chat}")
    private String directModel;

    @Value("${ai.deepseek.timeout-seconds:90}")
    private int directTimeoutSeconds;

    @Value("${ai.doubao.api-key:}")
    private String doubaoApiKey;

    @Value("${ai.doubao.api-url:https://ark.cn-beijing.volces.com/api/v3/chat/completions}")
    private String doubaoApiUrl;

    @Value("${ai.doubao.model:doubao-1-5-vision-pro-32k-250115}")
    private String doubaoModel;

    @Value("${ai.doubao.timeout-seconds:60}")
    private int doubaoTimeoutSeconds;

    @Value("${ai.gateway.litellm.api-key:}")
    private String litellmApiKey;

    @Value("${ai.gateway.litellm.timeout-seconds:30}")
    private int gatewayTimeoutSeconds;

    @Autowired
    private IntelligenceModelGatewayOrchestrator intelligenceModelGatewayOrchestrator;
    @Autowired
    private IntelligenceObservabilityOrchestrator intelligenceObservabilityOrchestrator;

    public IntelligenceInferenceResult chat(String scene, String systemPrompt, String userMessage) {
        List<AiMessage> msgs = new ArrayList<>();
        msgs.add(AiMessage.system(systemPrompt));
        msgs.add(AiMessage.user(userMessage));
        return chat(scene, msgs, null);
    }

    public IntelligenceInferenceResult chat(String scene, List<AiMessage> messages, List<AiTool> tools) {
        long start = System.currentTimeMillis();
        String traceId = UUID.randomUUID().toString();
        IntelligenceInferenceResult result;
        if (intelligenceModelGatewayOrchestrator.isGatewayReady()) {
            result = invokeLitellm(scene, messages, tools, traceId);
            if (!result.isSuccess() && intelligenceModelGatewayOrchestrator.isFallbackEnabled()) {
                IntelligenceInferenceResult fallback = invokeDirect(scene, messages, tools, traceId);
                fallback.setFallbackUsed(true);
                result = fallback;
            }
        } else {
            result = invokeDirect(scene, messages, tools, traceId);
        }
        result.setTraceId(traceId);
        result.setTraceUrl(intelligenceObservabilityOrchestrator.buildTraceUrl(traceId));
        result.setLatencyMs(Math.max(0, System.currentTimeMillis() - start));
        result.setPromptChars(length(messages.toString()));
        result.setResponseChars(length(result.getContent()));
        intelligenceObservabilityOrchestrator.recordInvocation(scene, result, UserContext.tenantId(), UserContext.userId());
        return result;
    }

    public boolean isAnyModelEnabled() {
        return intelligenceModelGatewayOrchestrator.isGatewayReady() || hasText(directApiKey);
    }

    private IntelligenceInferenceResult invokeLitellm(String scene, List<AiMessage> messages, List<AiTool> tools, String traceId) {
        String baseUrl = intelligenceModelGatewayOrchestrator.getGatewayBaseUrl();
        String model = intelligenceModelGatewayOrchestrator.getActiveModelName();
        String endpoint = normalizeChatCompletionsUrl(baseUrl);
        return invokeOpenAiCompatible(scene, "litellm", endpoint, litellmApiKey, model, messages, tools, gatewayTimeoutSeconds, traceId);
    }

    private IntelligenceInferenceResult invokeDirect(String scene, List<AiMessage> messages, List<AiTool> tools, String traceId) {
        return invokeOpenAiCompatible(scene, "direct", directApiUrl, directApiKey, directModel, messages, tools, directTimeoutSeconds, traceId);
    }

    private IntelligenceInferenceResult invokeOpenAiCompatible(String scene,
                                                               String provider,
                                                               String endpoint,
                                                               String apiKey,
                                                               String model,
                                                               List<AiMessage> messages,
                                                               List<AiTool> tools,
                                                               int timeoutSeconds,
                                                               String traceId) {
        IntelligenceInferenceResult result = new IntelligenceInferenceResult();
        result.setProvider(provider);
        result.setModel(model);
        result.setTraceId(traceId);
        if (!hasText(endpoint)) {
            result.setSuccess(false);
            result.setErrorMessage("endpoint-missing");
            return result;
        }
        if (!hasText(apiKey)) {
            result.setSuccess(false);
            result.setErrorMessage("api-key-missing");
            return result;
        }

        int effectiveTimeoutSeconds = resolveEffectiveTimeoutSeconds(scene, timeoutSeconds);
        boolean allowRetryOnTimeout = !"ai-advisor".equals(scene) && !"nl-intent".equals(scene);

        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        HttpRequest request = null;
        try {
            String body = buildRequestBody(model, messages, tools);
            request = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + apiKey)
                    .header("X-Trace-Id", traceId)
                    .header("X-Request-Id", traceId)
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .timeout(Duration.ofSeconds(effectiveTimeoutSeconds))
                    .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                result.setSuccess(true);
                extractResponse(response.body(), result);
                return result;
            }
            result.setSuccess(false);
            result.setErrorMessage("http-" + response.statusCode());
            log.warn("[IntelligenceInference] {} 调用失败 status={} body={}", provider, response.statusCode(),
                    response.body().substring(0, Math.min(200, response.body().length())));
            return result;
        } catch (java.net.http.HttpTimeoutException e) {
            if (!allowRetryOnTimeout) {
                result.setSuccess(false);
                result.setErrorMessage("timeout-" + effectiveTimeoutSeconds + "s");
                log.warn("[IntelligenceInference] {} 场景={} 超时({}s)，快速失败不重试", provider, scene, effectiveTimeoutSeconds);
                return result;
            }
            // 超时自动重试一次（间隔2秒）
            log.warn("[IntelligenceInference] {} 场景={} 首次超时({}s)，即将重试...", provider, scene, effectiveTimeoutSeconds);
            try {
                Thread.sleep(2000);
                HttpResponse<String> retryResp = client.send(request, HttpResponse.BodyHandlers.ofString());
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
                result.setErrorMessage("重试仍失败: " + retryEx.getClass().getSimpleName());
                log.warn("[IntelligenceInference] {} 重试也失败: {}", provider, retryEx.getMessage());
            }
            return result;
        } catch (Exception e) {
            result.setSuccess(false);
            result.setErrorMessage(e.getClass().getSimpleName() + ": " + e.getMessage());
            log.warn("[IntelligenceInference] {} 调用异常: {}", provider, e.getMessage());
            return result;
        }
    }

    private int resolveEffectiveTimeoutSeconds(String scene, int configuredTimeoutSeconds) {
        int raw = Math.max(configuredTimeoutSeconds, MIN_TIMEOUT_SECONDS);
        int cap = DEFAULT_MAX_TIMEOUT_SECONDS;
        if ("ai-advisor".equals(scene)) {
            cap = AI_ADVISOR_MAX_TIMEOUT_SECONDS;
        } else if ("nl-intent".equals(scene)) {
            cap = NL_INTENT_MAX_TIMEOUT_SECONDS;
        }
        int effective = Math.min(raw, cap);
        if (effective != raw) {
            log.info("[IntelligenceInference] 场景={} 超时已封顶: configured={}s -> effective={}s", scene, raw, effective);
        }
        return effective;
    }

    private String buildRequestBody(String model, List<AiMessage> messages, List<AiTool> tools) throws Exception {
        var root = MAPPER.createObjectNode();
        root.put("model", model);
        root.put("temperature", 0.0);
        root.set("messages", MAPPER.valueToTree(messages));
        if (tools != null && !tools.isEmpty()) {
            root.set("tools", MAPPER.valueToTree(tools));
        }
        return MAPPER.writeValueAsString(root);
    }

    private void extractResponse(String responseBody, IntelligenceInferenceResult result) throws Exception {
        JsonNode root = MAPPER.readTree(responseBody);
        JsonNode choices = root.path("choices");
        if (choices.isArray() && choices.size() > 0) {
            JsonNode message = choices.get(0).path("message");
            result.setContent(message.path("content").asText(null));
            if (message.has("tool_calls")) {
                List<AiToolCall> toolCalls = MAPPER.convertValue(message.path("tool_calls"), new TypeReference<List<AiToolCall>>(){});
                result.setToolCalls(toolCalls);
                result.setToolCallCount(toolCalls == null ? 0 : toolCalls.size());
            }
        }
    }

    private String normalizeChatCompletionsUrl(String baseUrl) {
        if (!hasText(baseUrl)) {
            return null;
        }
        String value = baseUrl.trim();
        if (value.endsWith("/chat/completions")) {
            return value;
        }
        if (value.endsWith("/")) {
            return value + "chat/completions";
        }
        return value + "/chat/completions";
    }

    private int length(String value) {
        return value == null ? 0 : value.length();
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    public boolean isVisionEnabled() {
        if (!hasText(doubaoApiKey)) {
            log.warn("[Vision] Doubao 未配置，视觉分析不可用");
        }
        return hasText(doubaoApiKey);
    }

    public String chatWithDoubaoVision(String imageUrl, String textPrompt) {
        if (!hasText(doubaoApiKey) || !hasText(imageUrl)) {
            log.warn("[DoubaoVision] 缺少必要参数：apiKey 或 imageUrl 为空");
            return null;
        }
        try {
            // base64 数据URI超过8MB时跳过，避免Doubao API超时或拒绝请求（通常HTTP body限制10MB）
            if (imageUrl.startsWith("data:") && imageUrl.length() > 8 * 1024 * 1024) {
                log.warn("[DoubaoVision] Base64 数据URI超过8MB({}MB)，已跳过以防API超时。建议使用COS存储后用HTTP URL调用",
                        imageUrl.length() / 1024 / 1024);
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
            HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
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
                log.error("[DoubaoVision] 模型端点无效(404): model={} — 请在 Volcengine ARK 控制台开通该模型或改用有效端点ID。" +
                        " 可在 .run/backend.env 添加 DOUBAO_MODEL=<您的端点ID> 后重启后端。错误: {}",
                        doubaoModel, body.substring(0, Math.min(300, body.length())));
            } else {
                log.warn("[DoubaoVision] 调用失败 status={} body={}", response.statusCode(),
                        body.substring(0, Math.min(200, body.length())));
            }
        } catch (Exception e) {
            log.warn("[DoubaoVision] 图像分析异常: {}", e.getMessage());
        }
        return null;
    }

    private String buildDoubaoVisionPayload(String imageUrl, String textPrompt) throws Exception {
        // Doubao vision API payload format
        String json = "{" +
                "\"model\":\"" + doubaoModel + "\"," +
                "\"messages\":[{" +
                "\"role\":\"user\"," +
                "\"content\":[" +
                "{\"type\":\"image_url\",\"image_url\":{\"url\":\"" + escapeJsonString(imageUrl) + "\"}}," +
                "{\"type\":\"text\",\"text\":\"" + escapeJsonString(textPrompt) + "\"}" +
                "]" +
                "}]" +
                "}";
        return json;
    }

    private String escapeJsonString(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\r", "\\r").replace("\n", "\\n");
    }
}
