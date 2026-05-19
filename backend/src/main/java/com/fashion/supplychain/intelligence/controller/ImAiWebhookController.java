package com.fashion.supplychain.intelligence.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.orchestration.AiAgentOrchestrator;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

@Slf4j
@RestController
@RequestMapping("/api/intelligence/im-ai")
@RequiredArgsConstructor
public class ImAiWebhookController {

    private final AiAgentOrchestrator aiAgentOrchestrator;
    private final UserService userService;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Value("${ai.im-ai.feishu.enabled:false}")
    private boolean feishuEnabled;

    @Value("${ai.im-ai.feishu.verification-token:}")
    private String feishuVerificationToken;

    @Value("${ai.im-ai.feishu.encrypt-key:}")
    private String feishuEncryptKey;

    @Value("${ai.im-ai.dingtalk.enabled:false}")
    private boolean dingtalkEnabled;

    @Value("${ai.im-ai.dingtalk.app-secret:}")
    private String dingtalkAppSecret;

    @PostMapping("/feishu/callback")
    public ResponseEntity<?> feishuCallback(@RequestBody String body,
                                            @RequestHeader(value = "X-Lark-Signature", required = false) String signature,
                                            @RequestHeader(value = "X-Lark-Request-Timestamp", required = false) String timestamp,
                                            @RequestHeader(value = "X-Lark-Request-Nonce", required = false) String nonce) {
        String workingBody = body;
        if (body.contains("\"encrypt\"") && feishuEncryptKey != null && !feishuEncryptKey.isBlank()) {
            String encryptValue = extractJsonValue(body, "encrypt");
            if (encryptValue != null) {
                try {
                    workingBody = decryptFeishuBody(encryptValue, feishuEncryptKey);
                    log.info("[IM-AI/Feishu] decrypted callback body, length={}", workingBody.length());
                } catch (Exception e) {
                    log.error("[IM-AI/Feishu] decryption failed: {}", e.getMessage());
                    return ResponseEntity.status(500).body(Map.of("error", "decryption failed"));
                }
            }
        }

        if (!feishuEnabled) return ResponseEntity.status(503).body(Map.of("error", "service disabled"));

        if (workingBody.contains("\"challenge\"")) {
            try {
                String challenge = extractJsonValue(workingBody, "challenge");
                if (challenge != null) {
                    log.info("[IM-AI/Feishu] URL verification challenge received");
                    return ResponseEntity.ok(Map.of("challenge", challenge));
                }
            } catch (Exception e) {
                log.warn("[IM-AI/Feishu] challenge parse error: {}", e.getMessage());
            }
        }

        if (feishuVerificationToken == null || feishuVerificationToken.isBlank()) {
            log.error("[IM-AI/Feishu] verification-token 未配置，拒绝回调请求（安全策略：未配置验证凭据时禁止处理外部消息）");
            return ResponseEntity.status(401).body(Map.of("error", "verification not configured"));
        }

        if (signature == null || timestamp == null || nonce == null) {
            log.warn("[IM-AI/Feishu] missing signature headers, rejecting");
            return ResponseEntity.status(401).body(Map.of("error", "missing signature headers"));
        }
        if (feishuEncryptKey == null || feishuEncryptKey.isBlank()) {
            log.error("[IM-AI/Feishu] encrypt-key not configured, rejecting callback for safety");
            return ResponseEntity.status(500).body(Map.of("error", "server misconfiguration"));
        }
        String expected = hmacSha256(feishuEncryptKey, timestamp + nonce + body);
        if (!expected.equals(signature)) {
            log.warn("[IM-AI/Feishu] signature verification failed");
            return ResponseEntity.status(401).body(Map.of("error", "signature mismatch"));
        }

        try {
            if (workingBody.contains("\"schema\"") && workingBody.contains("\"2.0\"")) {
                return handleFeishuV2Event(workingBody);
            }
            String eventType = extractJsonValue(workingBody, "type");
            if (!"im.message.receive_v1".equals(eventType)) {
                return ResponseEntity.ok(Map.of());
            }

            String msgType = extractJsonValue(workingBody, "msg_type");
            if (!"text".equals(msgType)) {
                return ResponseEntity.ok(Map.of());
            }

            String content = extractJsonValue(workingBody, "text");
            String userId = extractJsonValue(workingBody, "user_id");
            String openId = extractJsonValue(workingBody, "open_id");

            if (content == null || content.isBlank()) return ResponseEntity.ok(Map.of());

            log.info("[IM-AI/Feishu] received from={} content={}", openId != null ? openId : userId, content.length() > 50 ? content.substring(0, 50) + "..." : content);

            User user = resolveUser("feishu", openId != null ? openId : userId);
            if (user == null) {
                log.info("[IM-AI/Feishu] user not found: openId={}", openId);
                return ResponseEntity.status(404).body(Map.of("msg", "请先在系统中绑定飞书账号"));
            }

            UserContext ctx = buildUserContext(user);
            UserContext.set(ctx);
            try {
                var agentResult = aiAgentOrchestrator.executeAgent(content);
                String reply = agentResult.getData() != null ? agentResult.getData() : agentResult.getMessage();
                return ResponseEntity.ok(Map.of("msg", reply != null ? reply : "暂无回复"));
            } finally {
                UserContext.clear();
            }
        } catch (Exception e) {
            log.error("[IM-AI/Feishu] handle error: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body(Map.of("error", "internal error"));
        }
    }

    @PostMapping("/dingtalk/callback")
    public ResponseEntity<?> dingtalkCallback(@RequestBody String body,
                                              @RequestHeader(value = "sign", required = false) String sign,
                                              @RequestHeader(value = "timestamp", required = false) String timestamp) {
        if (!dingtalkEnabled) return ResponseEntity.status(503).body(Map.of("error", "service disabled"));

        if (dingtalkAppSecret == null || dingtalkAppSecret.isBlank()) {
            log.error("[IM-AI/DingTalk] app-secret 未配置，拒绝回调请求（安全策略：未配置验证凭据时禁止处理外部消息）");
            return ResponseEntity.status(401).body(Map.of("error", "verification not configured"));
        }

        if (sign == null || timestamp == null) {
            log.warn("[IM-AI/DingTalk] missing signature headers, rejecting");
            return ResponseEntity.status(401).body(Map.of("error", "missing signature headers"));
        }
        String expected = hmacSha256(dingtalkAppSecret, timestamp);
        if (!expected.equals(sign)) {
            log.warn("[IM-AI/DingTalk] signature verification failed");
            return ResponseEntity.status(401).body(Map.of("error", "signature mismatch"));
        }

        try {
            String msgType = extractJsonValue(body, "msgtype");
            if (!"text".equals(msgType)) return ResponseEntity.ok(Map.of());

            String content = extractJsonValue(body, "content");
            String staffId = extractJsonValue(body, "staffId");
            String senderId = extractJsonValue(body, "senderId");
            String senderNick = extractJsonValue(body, "senderNick");

            if (content == null || content.isBlank()) return ResponseEntity.ok(Map.of());

            log.info("[IM-AI/DingTalk] received from={}({}) content={}", senderNick, staffId, content.length() > 50 ? content.substring(0, 50) + "..." : content);

            User user = resolveUser("dingtalk", staffId != null ? staffId : senderId);
            if (user == null) {
                log.info("[IM-AI/DingTalk] user not found: staffId={}", staffId);
                return ResponseEntity.status(404).body(Map.of("msgtype", "text", "text", Map.of("content", "请先在系统中绑定钉钉账号")));
            }

            UserContext ctx = buildUserContext(user);
            UserContext.set(ctx);
            try {
                var agentResult = aiAgentOrchestrator.executeAgent(content);
                String reply = agentResult.getData() != null ? agentResult.getData() : agentResult.getMessage();
                return ResponseEntity.ok(Map.of("msgtype", "text", "text", Map.of("content", reply != null ? reply : "暂无回复")));
            } finally {
                UserContext.clear();
            }
        } catch (Exception e) {
            log.error("[IM-AI/DingTalk] handle error: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body(Map.of("error", "internal error"));
        }
    }

    @PreAuthorize("isAuthenticated()")
    @GetMapping("/status")
    public ResponseEntity<?> status() {
        return ResponseEntity.ok(Map.of(
                "feishu", feishuEnabled ? "enabled" : "disabled",
                "dingtalk", dingtalkEnabled ? "enabled" : "disabled"
        ));
    }

    private User resolveUser(String platform, String externalId) {
        if (externalId == null) return null;
        return userService.findByOpenid(platform + ":" + externalId);
    }

    private UserContext buildUserContext(User user) {
        UserContext ctx = new UserContext();
        ctx.setUserId(String.valueOf(user.getId()));
        ctx.setUsername(user.getUsername());
        ctx.setRole(user.getRoleName());
        ctx.setTenantId(user.getTenantId());
        ctx.setTenantOwner("admin".equals(user.getRoleName()) || "管理员".equals(user.getRoleName()));
        ctx.setSuperAdmin(false);
        ctx.setPermissionRange("all");
        return ctx;
    }

    private String decryptFeishuBody(String encrypt, String key) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] keyBytes = digest.digest(key.getBytes(StandardCharsets.UTF_8));
            byte[] allBytes = Base64.getDecoder().decode(encrypt);
            byte[] ivBytes = Arrays.copyOfRange(allBytes, 0, 16);
            byte[] encrypted = Arrays.copyOfRange(allBytes, 16, allBytes.length);
            Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
            SecretKeySpec secretKey = new SecretKeySpec(keyBytes, "AES");
            IvParameterSpec iv = new IvParameterSpec(ivBytes);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, iv);
            byte[] decrypted = cipher.doFinal(encrypted);
            return new String(decrypted, StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.error("[IM-AI/Feishu] decrypt body error: {}", e.getMessage());
            throw new RuntimeException("decrypt failed", e);
        }
    }

    private ResponseEntity<?> handleFeishuV2Event(String body) {
        try {
            Map<String, Object> root = OBJECT_MAPPER.readValue(body, new TypeReference<Map<String, Object>>() {});
            Map<String, Object> header = (Map<String, Object>) root.get("header");
            String eventType = header != null ? (String) header.get("event_type") : null;
            if (!"im.message.receive_v1".equals(eventType)) {
                return ResponseEntity.ok(Map.of());
            }

            Map<String, Object> event = (Map<String, Object>) root.get("event");
            if (event == null) return ResponseEntity.ok(Map.of());

            Map<String, Object> message = (Map<String, Object>) event.get("message");
            if (message == null) return ResponseEntity.ok(Map.of());

            String messageType = (String) message.get("message_type");
            if (!"text".equals(messageType)) return ResponseEntity.ok(Map.of());

            String contentJson = (String) message.get("content");
            if (contentJson == null || contentJson.isBlank()) return ResponseEntity.ok(Map.of());
            String content = extractJsonValue(contentJson, "text");
            if (content == null || content.isBlank()) return ResponseEntity.ok(Map.of());

            Map<String, Object> sender = (Map<String, Object>) event.get("sender");
            Map<String, Object> senderId = sender != null ? (Map<String, Object>) sender.get("sender_id") : null;
            String openId = senderId != null ? (String) senderId.get("open_id") : null;
            String userId = senderId != null ? (String) senderId.get("user_id") : null;

            log.info("[IM-AI/Feishu v2] received from={} content={}", openId != null ? openId : userId,
                    content.length() > 50 ? content.substring(0, 50) + "..." : content);

            User user = resolveUser("feishu", openId != null ? openId : userId);
            if (user == null) {
                log.info("[IM-AI/Feishu v2] user not found: openId={}", openId);
                return ResponseEntity.status(404).body(Map.of("msg", "请先在系统中绑定飞书账号"));
            }

            UserContext ctx = buildUserContext(user);
            UserContext.set(ctx);
            try {
                var agentResult = aiAgentOrchestrator.executeAgent(content);
                String reply = agentResult.getData() != null ? agentResult.getData() : agentResult.getMessage();
                return ResponseEntity.ok(Map.of("msg", reply != null ? reply : "暂无回复"));
            } finally {
                UserContext.clear();
            }
        } catch (Exception e) {
            log.error("[IM-AI/Feishu v2] handle error: {}", e.getMessage(), e);
            return ResponseEntity.status(500).body(Map.of("error", "internal error"));
        }
    }

    private String extractJsonValue(String json, String key) {
        String pattern1 = "\"" + key + "\":\"";
        int start = json.indexOf(pattern1);
        if (start < 0) {
            String pattern2 = "\"" + key + "\":";
            start = json.indexOf(pattern2);
            if (start < 0) return null;
            start += pattern2.length();
            int end = json.indexOf(",", start);
            if (end < 0) end = json.indexOf("}", start);
            if (end < 0) return null;
            String val = json.substring(start, end).trim();
            if (val.startsWith("\"") && val.endsWith("\"")) val = val.substring(1, val.length() - 1);
            return val;
        }
        start += pattern1.length();
        int end = json.indexOf("\"", start);
        if (end < 0) return null;
        return json.substring(start, end);
    }

    private String hmacSha256(String key, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (Exception e) {
            log.error("[IM-AI] HMAC-SHA256 error: {}", e.getMessage());
            return "";
        }
    }
}
