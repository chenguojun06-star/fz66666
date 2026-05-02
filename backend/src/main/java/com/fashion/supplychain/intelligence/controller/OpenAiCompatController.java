package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.orchestration.AiAgentOrchestrator;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.*;

@Slf4j
@RestController
@RequestMapping("/v1")
@RequiredArgsConstructor
public class OpenAiCompatController {

    private final AiAgentOrchestrator aiAgentOrchestrator;

    @Value("${ai.openai-compat.enabled:false}")
    private boolean enabled;

    @Value("${ai.openai-compat.api-key:}")
    private String apiKey;

    @Value("${ai.openai-compat.api-key-map:}")
    private String apiKeyMapStr;

    @Value("${ai.openai-compat.tenant-id:1}")
    private Long defaultTenantId;

    @Value("${ai.openai-compat.model-name:xiaoyun-agent}")
    private String modelName;

    @Value("${app.sse.timeout:300000}")
    private long sseTimeout;

    private volatile Map<String, Long> apiKeyTenantMap;

    private Map<String, Long> getApiKeyTenantMap() {
        if (apiKeyTenantMap != null) return apiKeyTenantMap;
        Map<String, Long> map = new LinkedHashMap<>();
        if (apiKeyMapStr != null && !apiKeyMapStr.isBlank()) {
            for (String entry : apiKeyMapStr.split(",")) {
                String[] kv = entry.split("=");
                if (kv.length == 2) {
                    try {
                        map.put(kv[0].trim(), Long.parseLong(kv[1].trim()));
                    } catch (NumberFormatException e) {
                        log.warn("[OpenAI-Compat] invalid tenantId in api-key-map: {}", entry);
                    }
                }
            }
        }
        if (!apiKey.isBlank()) {
            map.putIfAbsent(apiKey, defaultTenantId);
        }
        apiKeyTenantMap = map;
        return apiKeyTenantMap;
    }

    @GetMapping("/models")
    public ResponseEntity<?> listModels(@RequestHeader(value = "Authorization", required = false) String auth) {
        ResponseEntity<?> authCheck = checkAuthAndSetContext(auth);
        if (authCheck != null) return authCheck;
        try {
            if (!enabled) return ResponseEntity.status(404).body(Map.of("error", Map.of("message", "OpenAI compat API is disabled", "type", "not_found")));
            Map<String, Object> model = new LinkedHashMap<>();
            model.put("id", modelName);
            model.put("object", "model");
            model.put("created", Instant.now().getEpochSecond());
            model.put("owned_by", "fashion-supply-chain");
            return ResponseEntity.ok(Map.of("object", "list", "data", List.of(model)));
        } finally {
            UserContext.clear();
        }
    }

    @PostMapping("/chat/completions")
    public ResponseEntity<?> chatCompletions(
            @RequestHeader(value = "Authorization", required = false) String auth,
            @RequestBody ChatCompletionRequest request) {
        ResponseEntity<?> authCheck = checkAuthAndSetContext(auth);
        if (authCheck != null) return authCheck;
        if (!enabled) {
            UserContext.clear();
            return ResponseEntity.status(404).body(Map.of("error", Map.of("message", "OpenAI compat API is disabled", "type", "not_found")));
        }

        String userMessage = extractLastUserMessage(request);
        if (userMessage == null || userMessage.isBlank()) {
            UserContext.clear();
            return ResponseEntity.badRequest().body(Map.of("error", Map.of("message", "messages must contain at least one user message", "type", "invalid_request_error")));
        }

        String systemPrompt = extractSystemPrompt(request);
        String pageContext = systemPrompt != null ? "System: " + systemPrompt : null;

        if (Boolean.TRUE.equals(request.getStream())) {
            return handleStreaming(userMessage, pageContext);
        }
        return handleSync(userMessage, pageContext);
    }

    @GetMapping("/health")
    public ResponseEntity<?> health() {
        if (!enabled) return ResponseEntity.ok(Map.of("status", "disabled"));
        return ResponseEntity.ok(Map.of("status", "ok", "platform", "fashion-supply-chain"));
    }

    private ResponseEntity<?> handleSync(String userMessage, String pageContext) {
        try {
            var agentResult = aiAgentOrchestrator.executeAgent(userMessage, pageContext);
            String content = agentResult.getData() != null ? agentResult.getData() : agentResult.getMessage();

            Map<String, Object> message = Map.of("role", "assistant", "content", content);
            Map<String, Object> choice = new LinkedHashMap<>();
            choice.put("index", 0);
            choice.put("message", message);
            choice.put("finish_reason", "stop");

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("id", "chatcmpl-" + UUID.randomUUID().toString().substring(0, 8));
            response.put("object", "chat.completion");
            response.put("created", Instant.now().getEpochSecond());
            response.put("model", modelName);
            response.put("choices", List.of(choice));
            response.put("usage", Map.of("prompt_tokens", 0, "completion_tokens", 0, "total_tokens", 0));
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("[OpenAI-Compat] sync error: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().body(Map.of("error", Map.of("message", e.getMessage(), "type", "internal_error")));
        } finally {
            UserContext.clear();
        }
    }

    private ResponseEntity<?> handleStreaming(String userMessage, String pageContext) {
        SseEmitter emitter = new SseEmitter(sseTimeout);
        String chatId = "chatcmpl-" + UUID.randomUUID().toString().substring(0, 8);

        Thread.startVirtualThread(UserContext.wrap(() -> {
            try {
                sendOpenAiChunk(emitter, chatId, null, Map.of("role", "assistant", "content", ""));

                var agentResult = aiAgentOrchestrator.executeAgent(userMessage, pageContext);
                String content = agentResult.getData() != null ? agentResult.getData() : agentResult.getMessage();

                if (content != null && !content.isBlank()) {
                    int chunkSize = 20;
                    for (int i = 0; i < content.length(); i += chunkSize) {
                        String chunk = content.substring(i, Math.min(i + chunkSize, content.length()));
                        sendOpenAiChunk(emitter, chatId, null, Map.of("content", chunk));
                    }
                }

                sendOpenAiChunk(emitter, chatId, "stop", Map.of());
                emitter.send(SseEmitter.event().data("[DONE]"));
                emitter.complete();
            } catch (Exception e) {
                log.error("[OpenAI-Compat] stream error: {}", e.getMessage(), e);
                try { emitter.completeWithError(e); } catch (Exception ignored) {}
            } finally {
                UserContext.clear();
            }
        }));

        emitter.onTimeout(() -> {
            log.warn("[OpenAI-Compat] SSE timeout chatId={}", chatId);
            UserContext.clear();
        });
        emitter.onError(e -> {
            log.warn("[OpenAI-Compat] SSE error chatId={}: {}", chatId, e.getMessage());
            UserContext.clear();
        });

        return ResponseEntity.ok().contentType(MediaType.TEXT_EVENT_STREAM).body(emitter);
    }

    private void sendOpenAiChunk(SseEmitter emitter, String chatId, String finishReason, Map<String, Object> delta) {
        try {
            Map<String, Object> choice = new LinkedHashMap<>();
            choice.put("index", 0);
            choice.put("delta", delta);
            choice.put("finish_reason", finishReason);
            Map<String, Object> chunk = new LinkedHashMap<>();
            chunk.put("id", chatId);
            chunk.put("object", "chat.completion.chunk");
            chunk.put("created", Instant.now().getEpochSecond());
            chunk.put("model", modelName);
            chunk.put("choices", List.of(choice));
            emitter.send(SseEmitter.event().data(chunk));
        } catch (Exception e) {
            log.debug("[OpenAI-Compat] chunk send error: {}", e.getMessage());
        }
    }

    private ResponseEntity<?> checkAuthAndSetContext(String auth) {
        Map<String, Long> keyMap = getApiKeyTenantMap();
        if (!keyMap.isEmpty()) {
            if (auth == null || !auth.startsWith("Bearer ")) {
                return ResponseEntity.status(401).body(Map.of("error", Map.of("message", "Invalid API key", "type", "authentication_error")));
            }
            String providedKey = auth.substring(7);
            Long tenantId = keyMap.get(providedKey);
            if (tenantId == null) {
                return ResponseEntity.status(401).body(Map.of("error", Map.of("message", "Invalid API key", "type", "authentication_error")));
            }
            setUserContext(tenantId);
        } else {
            setUserContext(defaultTenantId);
        }
        return null;
    }

    private void setUserContext(Long tenantId) {
        UserContext ctx = new UserContext();
        ctx.setUserId("openai-compat");
        ctx.setUsername("OpenAI-Compat-Client");
        ctx.setRole("admin");
        ctx.setTenantId(tenantId);
        ctx.setTenantOwner(true);
        ctx.setSuperAdmin(false);
        ctx.setPermissionRange("all");
        UserContext.set(ctx);
    }

    private String extractLastUserMessage(ChatCompletionRequest request) {
        if (request.getMessages() == null) return null;
        for (int i = request.getMessages().size() - 1; i >= 0; i--) {
            ChatMessage msg = request.getMessages().get(i);
            if ("user".equals(msg.getRole())) {
                if (msg.getContent() instanceof String) return (String) msg.getContent();
                if (msg.getContent() instanceof List<?> parts) {
                    StringBuilder sb = new StringBuilder();
                    for (Object p : parts) {
                        if (p instanceof Map<?, ?> m && "text".equals(m.get("type"))) {
                            if (sb.length() > 0) sb.append("\n");
                            sb.append(m.get("text"));
                        }
                    }
                    return sb.toString();
                }
            }
        }
        return null;
    }

    private String extractSystemPrompt(ChatCompletionRequest request) {
        if (request.getMessages() == null) return null;
        for (ChatMessage msg : request.getMessages()) {
            if ("system".equals(msg.getRole()) && msg.getContent() instanceof String) {
                return (String) msg.getContent();
            }
        }
        return null;
    }

    @Data
    public static class ChatCompletionRequest {
        private String model;
        private List<ChatMessage> messages;
        private Boolean stream;
        private Double temperature;
        private Integer max_tokens;
    }

    @Data
    public static class ChatMessage {
        private String role;
        private Object content;
    }
}
