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
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

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

    @Value("${ai.deepseek.timeout-seconds:90}")
    private int directTimeoutSeconds;

    @Value("${ai.qwen-vl.api-key:}")
    private String visionApiKey;

    @Value("${ai.qwen-vl.api-url:https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions}")
    private String visionApiUrl;

    @Value("${ai.qwen-vl.model:qwen-vl-max}")
    private String visionModel;

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
        IntelligenceInferenceResult result;
        if (intelligenceModelGatewayOrchestrator.isGatewayReady()) {
            result = invokeLitellm(messages, tools);
            if (!result.isSuccess() && intelligenceModelGatewayOrchestrator.isFallbackEnabled()) {
                IntelligenceInferenceResult fallback = invokeDirect(messages, tools);
                fallback.setFallbackUsed(true);
                result = fallback;
            }
        } else {
            result = invokeDirect(messages, tools);
        }
        result.setLatencyMs(Math.max(0, System.currentTimeMillis() - start));
        result.setPromptChars(length(messages.toString()));
        result.setResponseChars(length(result.getContent()));
        intelligenceObservabilityOrchestrator.recordInvocation(scene, result, UserContext.tenantId(), UserContext.userId());
        return result;
    }

    public boolean isAnyModelEnabled() {
        return intelligenceModelGatewayOrchestrator.isGatewayReady() || hasText(directApiKey);
    }

    private IntelligenceInferenceResult invokeLitellm(List<AiMessage> messages, List<AiTool> tools) {
        String baseUrl = intelligenceModelGatewayOrchestrator.getGatewayBaseUrl();
        String model = intelligenceModelGatewayOrchestrator.getActiveModelName();
        String endpoint = normalizeChatCompletionsUrl(baseUrl);
        return invokeOpenAiCompatible("litellm", endpoint, litellmApiKey, model, messages, tools, gatewayTimeoutSeconds);
    }

    private IntelligenceInferenceResult invokeDirect(List<AiMessage> messages, List<AiTool> tools) {
        return invokeOpenAiCompatible("direct", directApiUrl, directApiKey, directModel, messages, tools, directTimeoutSeconds);
    }

    private IntelligenceInferenceResult invokeOpenAiCompatible(String provider,
                                                               String endpoint,
                                                               String apiKey,
                                                               String model,
                                                               List<AiMessage> messages,
                                                               List<AiTool> tools,
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
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .timeout(Duration.ofSeconds(Math.max(timeoutSeconds, 5)))
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
            // 超时自动重试一次（间隔2秒）
            log.warn("[IntelligenceInference] {} 首次超时({}s)，即将重试...", provider, timeoutSeconds);
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

    /**
     * 调用 Qwen-VL 视觉大模型分析款式图片。
     *
     * @param imageUrl   可公网访问的图片 URL
     * @param textPrompt 文字指令
     * @return 模型的文本描述，失败时返回 null
     */
    public String chatWithVision(String imageUrl, String textPrompt) {
        if (!hasText(visionApiKey) || !hasText(imageUrl)) {
            return null;
        }
        try {
            var root = MAPPER.createObjectNode();
            root.put("model", visionModel);
            root.put("max_tokens", 512);

            var messages = MAPPER.createArrayNode();
            var userMsg = MAPPER.createObjectNode();
            userMsg.put("role", "user");

            // Qwen-VL 多模态格式：content 为 [{type:image_url,...},{type:text,...}]
            var content = MAPPER.createArrayNode();
            var imgNode = MAPPER.createObjectNode();
            imgNode.put("type", "image_url");
            var imgUrlObj = MAPPER.createObjectNode();
            imgUrlObj.put("url", imageUrl);
            imgNode.set("image_url", imgUrlObj);
            content.add(imgNode);

            var textNode = MAPPER.createObjectNode();
            textNode.put("type", "text");
            textNode.put("text", textPrompt);
            content.add(textNode);

            userMsg.set("content", content);
            messages.add(userMsg);
            root.set("messages", messages);

            String body = MAPPER.writeValueAsString(root);
            HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(visionApiUrl))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + visionApiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .timeout(Duration.ofSeconds(30))
                    .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                JsonNode respNode = MAPPER.readTree(response.body());
                JsonNode choices = respNode.path("choices");
                if (choices.isArray() && choices.size() > 0) {
                    String result = choices.get(0).path("message").path("content").asText(null);
                    log.info("[VisionModel] 图像分析完成，返回 {} 字", result == null ? 0 : result.length());
                    return result;
                }
            } else {
                String body2 = response.body();
                log.warn("[VisionModel] 调用失败 status={} body={}", response.statusCode(),
                        body2.substring(0, Math.min(200, body2.length())));
            }
        } catch (Exception e) {
            log.warn("[VisionModel] 图像分析异常: {}", e.getMessage());
        }
        return null;
    }

    public boolean isVisionEnabled() {
        // 优先使用 Doubao，次选 Qwen-VL
        boolean doubaoReady = hasText(doubaoApiKey);
        boolean qwenReady = hasText(visionApiKey);
        if (!doubaoReady && !qwenReady) {
            log.warn("[Vision] 无可用视觉模型：doubao 和 qwen-vl 均未配置");
        }
        return doubaoReady || qwenReady;
    }

    public String chatWithDoubaoVision(String imageUrl, String textPrompt) {
        if (!hasText(doubaoApiKey) || !hasText(imageUrl)) {
            log.warn("[DoubaoVision] 缺少必要参数：apiKey 或 imageUrl 为空");
            return null;
        }
        try {
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
