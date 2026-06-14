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
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

@Slf4j
@RestController
@RequestMapping("/api/intelligence/im-ai")
@RequiredArgsConstructor
public class ImAiWebhookController {

    private final AiAgentOrchestrator aiAgentOrchestrator;
    private final UserService userService;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final Executor ASYNC_EXECUTOR = Executors.newFixedThreadPool(4, r -> {
        Thread t = new Thread(r, "feishu-ai-async");
        t.setDaemon(true);
        return t;
    });

    @Value("${ai.im-ai.feishu.enabled:false}")
    private boolean feishuEnabled;

    @Value("${ai.im-ai.feishu.verification-token:}")
    private String feishuVerificationToken;

    @Value("${ai.im-ai.feishu.encrypt-key:}")
    private String feishuEncryptKey;

    @Value("${ai.im-ai.feishu.app-id:}")
    private String feishuAppId;

    @Value("${ai.im-ai.feishu.app-secret:}")
    private String feishuAppSecret;

    @Value("${ai.im-ai.dingtalk.enabled:false}")
    private boolean dingtalkEnabled;

    @Value("${ai.im-ai.dingtalk.app-secret:}")
    private String dingtalkAppSecret;

    // ==================== 飞书回调 ====================

    /**
     * 飞书回调 URL 验证（GET 请求）
     * 飞书配置回调地址时，会先发 GET 请求验证 URL 有效性，要求返回 challenge 参数
     */
    @GetMapping("/feishu/callback")
    public ResponseEntity<?> feishuCallbackVerification(
            @RequestParam(value = "challenge", required = false) String challenge,
            @RequestParam(value = "token", required = false) String token) {
        if (challenge != null && !challenge.isBlank()) {
            log.info("[IM-AI/Feishu] URL verification GET challenge received");
            return ResponseEntity.ok(Map.of("challenge", challenge));
        }
        // 飞书可能不带 challenge 参数的 GET 探测，返回 200 即可
        log.info("[IM-AI/Feishu] GET callback without challenge, returning ok");
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

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

        // URL 验证（飞书配置回调时发送）
        if (workingBody.contains("\"challenge\"")) {
            try {
                String challenge = extractJsonValue(workingBody, "challenge");
                if (challenge != null) {
                    log.info("[IM-AI/Feishu] URL verification challenge received");
                    // 如果原始 body 是加密的，返回也需要加密
                    if (body.contains("\"encrypt\"") && feishuEncryptKey != null && !feishuEncryptKey.isBlank()) {
                        String encrypted = encryptFeishuBody("{\"challenge\":\"" + challenge + "\"}", feishuEncryptKey);
                        return ResponseEntity.ok(Map.of("challenge", challenge, "encrypt", encrypted));
                    }
                    return ResponseEntity.ok(Map.of("challenge", challenge));
                }
            } catch (Exception e) {
                log.warn("[IM-AI/Feishu] challenge parse error: {}", e.getMessage());
            }
        }

        // 签名验证
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
            // 解析事件
            FeishuMessageEvent event = parseFeishuEvent(workingBody);
            if (event == null) {
                return ResponseEntity.ok(Map.of());
            }

            // 立即返回 200（飞书要求 3 秒内响应）
            // 异步处理 AI 并回复
            CompletableFuture.runAsync(() -> handleFeishuMessageAsync(event), ASYNC_EXECUTOR);

            return ResponseEntity.ok(Map.of());
        } catch (Exception e) {
            log.error("[IM-AI/Feishu] handle error: {}", e.getMessage(), e);
            return ResponseEntity.ok(Map.of()); // 仍然返回200，避免飞书重试
        }
    }

    // ==================== 钉钉回调 ====================

    @PostMapping("/dingtalk/callback")
    public ResponseEntity<?> dingtalkCallback(@RequestBody String body,
                                              @RequestHeader(value = "sign", required = false) String sign,
                                              @RequestHeader(value = "timestamp", required = false) String timestamp) {
        if (!dingtalkEnabled) return ResponseEntity.status(503).body(Map.of("error", "service disabled"));

        if (dingtalkAppSecret == null || dingtalkAppSecret.isBlank()) {
            log.error("[IM-AI/DingTalk] app-secret 未配置");
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

            log.info("[IM-AI/DingTalk] received from={}({}) content={}", senderNick, staffId,
                    content.length() > 50 ? content.substring(0, 50) + "..." : content);

            User user = resolveUser("dingtalk", staffId != null ? staffId : senderId);
            if (user == null) {
                log.info("[IM-AI/DingTalk] user not found: staffId={}", staffId);
                return ResponseEntity.ok(Map.of("msgtype", "text", "text", Map.of("content", "请先在系统中绑定钉钉账号")));
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

    // ==================== 飞书异步处理 ====================

    private void handleFeishuMessageAsync(FeishuMessageEvent event) {
        String openId = event.openId;
        String content = event.content;
        String chatId = event.chatId;
        String msgId = event.messageId;

        try {
            // 1. 解析用户
            User user = resolveUser("feishu", openId);
            if (user == null) {
                log.info("[IM-AI/Feishu] user not found: openId={}", openId);
                sendFeishuReply(openId, chatId, "请先在系统中绑定飞书账号（设置 → 个人信息 → 绑定飞书）");
                return;
            }

            // 2. 设置用户上下文
            UserContext ctx = buildUserContext(user);
            UserContext.set(ctx);

            try {
                // 3. 调用 AI
                log.info("[IM-AI/Feishu] processing AI for openId={} content={}", openId,
                        content.length() > 50 ? content.substring(0, 50) + "..." : content);
                var agentResult = aiAgentOrchestrator.executeAgent(content);
                String reply = agentResult.getData() != null ? agentResult.getData() : agentResult.getMessage();
                if (reply == null || reply.isBlank()) reply = "暂无回复";

                // 4. 通过飞书 API 回复
                sendFeishuReply(openId, chatId, reply);
                log.info("[IM-AI/Feishu] reply sent to openId={} length={}", openId, reply.length());
            } finally {
                UserContext.clear();
            }
        } catch (Exception e) {
            log.error("[IM-AI/Feishu] async handle error: {}", e.getMessage(), e);
            sendFeishuReply(openId, chatId, "处理出错，请稍后再试");
        }
    }

    /**
     * 通过飞书 API 发送消息
     * 优先用 chat_id（群聊），其次用 open_id（私聊）
     */
    private void sendFeishuReply(String openId, String chatId, String text) {
        try {
            String token = getFeishuTenantAccessToken();
            if (token == null) {
                log.error("[IM-AI/Feishu] 获取 tenant_access_token 失败，无法回复");
                return;
            }

            RestTemplate rt = new RestTemplate();
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "Bearer " + token);

            Map<String, Object> body = new HashMap<>();
            body.put("msg_type", "text");

            Map<String, String> textContent = new HashMap<>();
            textContent.put("text", text);
            body.put("content", textContent);

            // 优先回复群聊（receive_id_type=chat_id），否则私聊（open_id）
            if (chatId != null && !chatId.isBlank()) {
                body.put("receive_id", chatId);
                body.put("receive_id_type", "chat_id");
            } else {
                body.put("receive_id", openId);
                body.put("receive_id_type", "open_id");
            }

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = rt.exchange(
                    "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type="
                            + (chatId != null && !chatId.isBlank() ? "chat_id" : "open_id"),
                    HttpMethod.POST, request, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Object code = response.getBody().get("code");
                if (code != null && !Integer.valueOf(0).equals(code)) {
                    log.warn("[IM-AI/Feishu] 发送消息失败 code={} msg={}", code, response.getBody().get("msg"));
                }
            } else {
                log.warn("[IM-AI/Feishu] 发送消息 HTTP 非2xx status={}", response.getStatusCode());
            }
        } catch (Exception e) {
            log.error("[IM-AI/Feishu] 发送消息异常: {}", e.getMessage());
        }
    }

    /**
     * 获取飞书 tenant_access_token
     * 文档：https://open.feishu.cn/document/server-docs/authentication/access-token/tenant_access_token
     */
    private String getFeishuTenantAccessToken() {
        if (feishuAppId == null || feishuAppId.isBlank() || feishuAppSecret == null || feishuAppSecret.isBlank()) {
            log.error("[IM-AI/Feishu] app-id 或 app-secret 未配置，无法获取 token");
            return null;
        }

        try {
            RestTemplate rt = new RestTemplate();
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            Map<String, String> body = new HashMap<>();
            body.put("app_id", feishuAppId);
            body.put("app_secret", feishuAppSecret);

            HttpEntity<Map<String, String>> request = new HttpEntity<>(body, headers);
            ResponseEntity<Map> response = rt.exchange(
                    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
                    HttpMethod.POST, request, Map.class);

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                Object code = response.getBody().get("code");
                if (code != null && Integer.valueOf(0).equals(code)) {
                    return (String) response.getBody().get("tenant_access_token");
                }
                log.error("[IM-AI/Feishu] 获取 token 失败 code={} msg={}", code, response.getBody().get("msg"));
            }
        } catch (Exception e) {
            log.error("[IM-AI/Feishu] 获取 token 异常: {}", e.getMessage());
        }
        return null;
    }

    // ==================== 飞书事件解析 ====================

    private FeishuMessageEvent parseFeishuEvent(String body) {
        try {
            // v2.0 schema
            if (body.contains("\"schema\"") && body.contains("\"2.0\"")) {
                Map<String, Object> root = OBJECT_MAPPER.readValue(body, new TypeReference<Map<String, Object>>() {});
                Map<String, Object> header = (Map<String, Object>) root.get("header");
                String eventType = header != null ? (String) header.get("event_type") : null;
                if (!"im.message.receive_v1".equals(eventType)) return null;

                Map<String, Object> event = (Map<String, Object>) root.get("event");
                if (event == null) return null;

                Map<String, Object> message = (Map<String, Object>) event.get("message");
                if (message == null) return null;

                String messageType = (String) message.get("message_type");
                if (!"text".equals(messageType)) return null;

                String contentJson = (String) message.get("content");
                if (contentJson == null || contentJson.isBlank()) return null;
                String content = extractJsonValue(contentJson, "text");
                if (content == null || content.isBlank()) return null;

                // 去掉 @机器人 的 mention
                content = content.replaceAll("@_user_\\d+\\s*", "").trim();
                if (content.isBlank()) return null;

                String chatId = (String) message.get("chat_id");
                String msgId = (String) message.get("message_id");

                Map<String, Object> sender = (Map<String, Object>) event.get("sender");
                Map<String, Object> senderId = sender != null ? (Map<String, Object>) sender.get("sender_id") : null;
                String openId = senderId != null ? (String) senderId.get("open_id") : null;

                FeishuMessageEvent e = new FeishuMessageEvent();
                e.openId = openId;
                e.content = content;
                e.chatId = chatId;
                e.messageId = msgId;
                return e;
            }

            // v1.0
            String eventType = extractJsonValue(body, "type");
            if (!"im.message.receive_v1".equals(eventType)) return null;

            String msgType = extractJsonValue(body, "msg_type");
            if (!"text".equals(msgType)) return null;

            String content = extractJsonValue(body, "text");
            String openId = extractJsonValue(body, "open_id");
            String chatId = extractJsonValue(body, "chat_id");

            if (content == null || content.isBlank()) return null;
            content = content.replaceAll("@_user_\\d+\\s*", "").trim();
            if (content.isBlank()) return null;

            FeishuMessageEvent e = new FeishuMessageEvent();
            e.openId = openId;
            e.content = content;
            e.chatId = chatId;
            return e;
        } catch (Exception e) {
            log.error("[IM-AI/Feishu] parse event error: {}", e.getMessage());
            return null;
        }
    }

    // ==================== 内部 DTO ====================

    private static class FeishuMessageEvent {
        String openId;
        String content;
        String chatId;
        String messageId;
    }

    // ==================== 通用工具 ====================

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
        boolean isAdmin = "admin".equals(user.getRoleName()) || "管理员".equals(user.getRoleName())
                || Boolean.TRUE.equals(user.getIsTenantOwner());
        ctx.setTenantOwner(isAdmin);
        ctx.setSuperAdmin(false);
        if (isAdmin) {
            ctx.setPermissionRange("all");
        } else {
            String userRange = user.getPermissionRange();
            ctx.setPermissionRange(userRange != null && !userRange.isBlank() ? userRange : "own");
        }
        if (user.getFactoryId() != null && !user.getFactoryId().isBlank()) {
            ctx.setFactoryId(user.getFactoryId());
        }
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

    /**
     * 飞书 AES 加密（加密策略开启时，URL 验证返回需要加密）
     */
    private String encryptFeishuBody(String plaintext, String key) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] keyBytes = digest.digest(key.getBytes(StandardCharsets.UTF_8));
            // 生成随机 16 字节 IV
            byte[] ivBytes = new byte[16];
            new java.security.SecureRandom().nextBytes(ivBytes);
            Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
            SecretKeySpec secretKey = new SecretKeySpec(keyBytes, "AES");
            IvParameterSpec iv = new IvParameterSpec(ivBytes);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, iv);
            byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            // 拼接 IV + 密文，Base64 编码
            byte[] combined = new byte[ivBytes.length + encrypted.length];
            System.arraycopy(ivBytes, 0, combined, 0, ivBytes.length);
            System.arraycopy(encrypted, 0, combined, ivBytes.length, encrypted.length);
            return Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            log.error("[IM-AI/Feishu] encrypt body error: {}", e.getMessage());
            throw new RuntimeException("encrypt failed", e);
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
