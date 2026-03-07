package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * 智能推理编排器。
 *
 * <p>职责：统一管理 AI 推理调用路径，优先使用模型网关，必要时回退到直连模型。</p>
 */
@Service
@Slf4j
public class IntelligenceInferenceOrchestrator {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Value("${ai.deepseek.api-key:}")
    private String directApiKey;

    @Value("${ai.deepseek.api-url:https://api.deepseek.com/v1/chat/completions}")
    private String directApiUrl;

    @Value("${ai.deepseek.model:deepseek-chat}")
    private String directModel;

    @Value("${ai.gateway.litellm.api-key:}")
    private String litellmApiKey;

    @Value("${ai.gateway.litellm.timeout-seconds:30}")
    private int gatewayTimeoutSeconds;

    @Autowired
    private IntelligenceModelGatewayOrchestrator intelligenceModelGatewayOrchestrator;

    @Autowired
    private IntelligenceObservabilityOrchestrator intelligenceObservabilityOrchestrator;

    public IntelligenceInferenceResult chat(String scene, String systemPrompt, String userMessage) {
        long start = System.currentTimeMillis();
        IntelligenceInferenceResult result;
        if (intelligenceModelGatewayOrchestrator.isGatewayReady()) {
            result = invokeLitellm(systemPrompt, userMessage);
            if (!result.isSuccess() && intelligenceModelGatewayOrchestrator.isFallbackEnabled()) {
                IntelligenceInferenceResult fallback = invokeDirect(systemPrompt, userMessage);
                fallback.setFallbackUsed(true);
                result = fallback;
            }
        } else {
            result = invokeDirect(systemPrompt, userMessage);
        }
        result.setLatencyMs(Math.max(0, System.currentTimeMillis() - start));
        result.setPromptChars(length(systemPrompt) + length(userMessage));
        result.setResponseChars(length(result.getContent()));
        intelligenceObservabilityOrchestrator.recordInvocation(scene, result, UserContext.tenantId(), UserContext.userId());
        return result;
    }

    public boolean isAnyModelEnabled() {
        return intelligenceModelGatewayOrchestrator.isGatewayReady() || hasText(directApiKey);
    }

    private IntelligenceInferenceResult invokeLitellm(String systemPrompt, String userMessage) {
        String baseUrl = intelligenceModelGatewayOrchestrator.getGatewayBaseUrl();
        String model = intelligenceModelGatewayOrchestrator.getActiveModelName();
        String endpoint = normalizeChatCompletionsUrl(baseUrl);
        return invokeOpenAiCompatible("litellm", endpoint, litellmApiKey, model, systemPrompt, userMessage, gatewayTimeoutSeconds);
    }

    private IntelligenceInferenceResult invokeDirect(String systemPrompt, String userMessage) {
        return invokeOpenAiCompatible("direct", directApiUrl, directApiKey, directModel, systemPrompt, userMessage, 30);
    }

    private IntelligenceInferenceResult invokeOpenAiCompatible(String provider,
                                                               String endpoint,
                                                               String apiKey,
                                                               String model,
                                                               String systemPrompt,
                                                               String userMessage,
                                                               int timeoutSeconds) {
        IntelligenceInferenceResult result = new IntelligenceInferenceResult();
        result.setProvider(provider);
        result.setModel(model);
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

        try {
            String body = buildRequestBody(model, systemPrompt, userMessage);
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .build();
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .timeout(Duration.ofSeconds(Math.max(timeoutSeconds, 5)))
                    .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                result.setSuccess(true);
                result.setContent(extractContent(response.body()));
                return result;
            }
            result.setSuccess(false);
            result.setErrorMessage("http-" + response.statusCode());
            log.warn("[IntelligenceInference] {} 调用失败 status={} body={}", provider, response.statusCode(),
                    response.body().substring(0, Math.min(200, response.body().length())));
            return result;
        } catch (Exception e) {
            result.setSuccess(false);
            result.setErrorMessage(e.getClass().getSimpleName() + ": " + e.getMessage());
            log.warn("[IntelligenceInference] {} 调用异常: {}", provider, e.getMessage());
            return result;
        }
    }

    private String buildRequestBody(String model, String systemPrompt, String userMessage) throws Exception {
        var root = MAPPER.createObjectNode();
        root.put("model", model);
        root.put("temperature", 0.3);
        root.put("max_tokens", 512);
        var messages = root.putArray("messages");
        messages.addObject().put("role", "system").put("content", systemPrompt);
        messages.addObject().put("role", "user").put("content", userMessage);
        return MAPPER.writeValueAsString(root);
    }

    private String extractContent(String responseBody) throws Exception {
        JsonNode root = MAPPER.readTree(responseBody);
        JsonNode choices = root.path("choices");
        if (choices.isArray() && choices.size() > 0) {
            return choices.get(0).path("message").path("content").asText(null);
        }
        return null;
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
}
