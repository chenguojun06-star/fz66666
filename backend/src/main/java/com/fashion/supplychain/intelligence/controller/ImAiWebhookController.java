package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.orchestration.AiAgentOrchestrator;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.UserService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Slf4j
@RestController
@RequestMapping("/api/intelligence/im-ai")
@RequiredArgsConstructor
public class ImAiWebhookController {

    private final AiAgentOrchestrator aiAgentOrchestrator;
    private final UserService userService;

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
        if (!feishuEnabled) return ResponseEntity.ok(Map.of());

        if (body.contains("\"challenge\"")) {
            try {
                String challenge = extractJsonValue(body, "challenge");
                if (challenge != null) {
                    log.info("[IM-AI/Feishu] URL verification challenge received");
                    return ResponseEntity.ok(Map.of("challenge", challenge));
                }
            } catch (Exception e) {
                log.warn("[IM-AI/Feishu] challenge parse error: {}", e.getMessage());
            }
        }

        if (feishuVerificationToken != null && !feishuVerificationToken.isBlank()) {
            if (signature != null && timestamp != null && !feishuEncryptKey.isBlank()) {
                String expected = hmacSha256(feishuEncryptKey, timestamp + nonce + body);
                if (!expected.equals(signature)) {
                    log.warn("[IM-AI/Feishu] signature verification failed");
                    return ResponseEntity.status(401).body(Map.of("error", "signature mismatch"));
                }
            }
        }

        try {
            String eventType = extractJsonValue(body, "type");
            if (!"im.message.receive_v1".equals(eventType)) {
                return ResponseEntity.ok(Map.of());
            }

            String msgType = extractJsonValue(body, "msg_type");
            if (!"text".equals(msgType)) {
                return ResponseEntity.ok(Map.of());
            }

            String content = extractJsonValue(body, "text");
            String userId = extractJsonValue(body, "user_id");
            String openId = extractJsonValue(body, "open_id");

            if (content == null || content.isBlank()) return ResponseEntity.ok(Map.of());

            log.info("[IM-AI/Feishu] received from={} content={}", openId != null ? openId : userId, content.length() > 50 ? content.substring(0, 50) + "..." : content);

            User user = resolveUser("feishu", openId != null ? openId : userId);
            if (user == null) {
                log.info("[IM-AI/Feishu] user not found: openId={}", openId);
                return ResponseEntity.ok(Map.of("msg", "请先在系统中绑定飞书账号"));
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
            return ResponseEntity.ok(Map.of());
        }
    }

    @PostMapping("/dingtalk/callback")
    public ResponseEntity<?> dingtalkCallback(@RequestBody String body,
                                              @RequestHeader(value = "sign", required = false) String sign,
                                              @RequestHeader(value = "timestamp", required = false) String timestamp) {
        if (!dingtalkEnabled) return ResponseEntity.ok(Map.of());

        if (dingtalkAppSecret != null && !dingtalkAppSecret.isBlank() && sign != null && timestamp != null) {
            String expected = hmacSha256(dingtalkAppSecret, timestamp);
            if (!expected.equals(sign)) {
                log.warn("[IM-AI/DingTalk] signature verification failed");
                return ResponseEntity.status(401).body(Map.of("error", "signature mismatch"));
            }
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
            return ResponseEntity.ok(Map.of());
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
