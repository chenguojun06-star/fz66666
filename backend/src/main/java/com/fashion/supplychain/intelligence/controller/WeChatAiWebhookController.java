package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.orchestration.AiAgentOrchestrator;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.UserService;
import com.fashion.supplychain.wechat.client.WeChatMiniProgramClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.security.MessageDigest;
import java.util.*;

@Slf4j
@RestController
@RequestMapping("/api/intelligence/wechat-ai")
@RequiredArgsConstructor
public class WeChatAiWebhookController {

    private final AiAgentOrchestrator aiAgentOrchestrator;
    private final UserService userService;
    private final WeChatMiniProgramClient weChatClient;

    @Value("${ai.wechat-ai.enabled:false}")
    private boolean enabled;

    @Value("${ai.wechat-ai.verify-token:}")
    private String verifyToken;

    @Value("${ai.wechat-ai.app-id:}")
    private String appId;

    @Value("${ai.wechat-ai.app-secret:}")
    private String appSecret;

    @Value("${ai.wechat-ai.async-reply:true}")
    private boolean asyncReply;

    @GetMapping("/callback")
    public String verifyWeChat(
            @RequestParam(value = "signature", required = false) String signature,
            @RequestParam(value = "timestamp", required = false) String timestamp,
            @RequestParam(value = "nonce", required = false) String nonce,
            @RequestParam(value = "echostr", required = false) String echostr) {
        if (!enabled || verifyToken.isBlank() || signature == null || timestamp == null || nonce == null || echostr == null) {
            return "";
        }
        try {
            String[] arr = {verifyToken, timestamp, nonce};
            Arrays.sort(arr);
            StringBuilder sb = new StringBuilder();
            for (String s : arr) sb.append(s);
            byte[] digest = MessageDigest.getInstance("SHA-1").digest(sb.toString().getBytes());
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) hex.append(String.format("%02x", b));
            if (hex.toString().equals(signature)) {
                log.info("[WeChat-AI] verify success");
                return echostr;
            }
            log.warn("[WeChat-AI] verify failed: signature mismatch");
            return "";
        } catch (Exception e) {
            log.error("[WeChat-AI] verify error: {}", e.getMessage());
            return "";
        }
    }

    @PostMapping(value = "/callback", consumes = {MediaType.TEXT_XML_VALUE, MediaType.APPLICATION_XML_VALUE})
    public String handleWeChatMessage(@RequestBody String xmlBody) {
        if (!enabled) return buildTextReply("", "AI助手未启用");

        try {
            String fromUser = extractXmlValue(xmlBody, "FromUserName");
            String toUser = extractXmlValue(xmlBody, "ToUserName");
            String content = extractXmlValue(xmlBody, "Content");
            String msgType = extractXmlValue(xmlBody, "MsgType");

            if (fromUser == null || content == null) {
                return buildTextReply(toUser != null ? toUser : "", "消息格式异常");
            }

            if (!"text".equals(msgType)) {
                return buildTextReply(fromUser, "目前仅支持文字消息，请输入文字提问。");
            }

            log.info("[WeChat-AI] received from={} content={}", fromUser, content.length() > 50 ? content.substring(0, 50) + "..." : content);

            User user = userService.findByOpenid(fromUser);
            if (user == null) {
                log.info("[WeChat-AI] openid={} not bound to any user", fromUser);
                return buildTextReply(fromUser, "您还未绑定账号，请先在小程序中登录绑定后再使用AI助手。");
            }

            if (asyncReply) {
                Thread.startVirtualThread(() -> processAsync(fromUser, user, content));
                return buildTextReply(fromUser, "🤔 正在思考中，请稍等...");
            }

            return processSync(fromUser, user, content);
        } catch (Exception e) {
            log.error("[WeChat-AI] handle error: {}", e.getMessage(), e);
            return buildTextReply("", "系统异常，请稍后重试");
        }
    }

    private String processSync(String fromUser, User user, String content) {
        UserContext ctx = buildUserContext(user);
        UserContext.set(ctx);
        try {
            var agentResult = aiAgentOrchestrator.executeAgent(content);
            String reply = agentResult.getData() != null ? agentResult.getData() : agentResult.getMessage();
            if (reply == null || reply.isBlank()) reply = "抱歉，我暂时无法回答这个问题。";
            if (reply.length() > 2000) reply = reply.substring(0, 1997) + "...";
            return buildTextReply(fromUser, reply);
        } finally {
            UserContext.clear();
        }
    }

    private void processAsync(String fromUser, User user, String content) {
        UserContext ctx = buildUserContext(user);
        UserContext.set(ctx);
        try {
            var agentResult = aiAgentOrchestrator.executeAgent(content);
            String reply = agentResult.getData() != null ? agentResult.getData() : agentResult.getMessage();
            if (reply == null || reply.isBlank()) reply = "抱歉，我暂时无法回答这个问题。";
            if (reply.length() > 2000) reply = reply.substring(0, 1997) + "...";
            sendCustomerServiceMessage(fromUser, reply);
        } catch (Exception e) {
            log.error("[WeChat-AI] async process error: {}", e.getMessage(), e);
            sendCustomerServiceMessage(fromUser, "处理出错：" + e.getMessage());
        } finally {
            UserContext.clear();
        }
    }

    private void sendCustomerServiceMessage(String openId, String content) {
        try {
            String accessToken = weChatClient.fetchAccessToken();
            if (accessToken == null || accessToken.isBlank()) {
                log.warn("[WeChat-AI] cannot get access_token for customer service message");
                return;
            }
            String url = "https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=" + accessToken;
            String json = "{\"touser\":\"" + openId + "\",\"msgtype\":\"text\",\"text\":{\"content\":" + toJsonString(content) + "}}";
            java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
            java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create(url))
                    .header("Content-Type", "application/json")
                    .POST(java.net.http.HttpRequest.BodyPublishers.ofString(json))
                    .build();
            java.net.http.HttpResponse<String> response = client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString());
            log.info("[WeChat-AI] customer service message sent to={} response={}", openId, response.body().length() > 100 ? response.body().substring(0, 100) : response.body());
        } catch (Exception e) {
            log.error("[WeChat-AI] send customer service message failed: {}", e.getMessage());
        }
    }

    private String toJsonString(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> sb.append(c);
            }
        }
        return sb.append("\"").toString();
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

    @PreAuthorize("isAuthenticated()")
    @PostMapping("/send")
    public Result<String> sendAiMessage(@RequestBody Map<String, String> body) {
        if (!enabled) return Result.fail("微信AI助手未启用");

        String openId = body.get("openId");
        String message = body.get("message");
        if (openId == null || openId.isBlank()) return Result.badRequest("缺少openId");
        if (message == null || message.isBlank()) return Result.badRequest("缺少message");

        var agentResult = aiAgentOrchestrator.executeAgent(message);
        String reply = agentResult.getData() != null ? agentResult.getData() : agentResult.getMessage();
        return Result.success(reply);
    }

    private String buildTextReply(String toUser, String content) {
        return "<xml>" +
                "<ToUserName><![CDATA[" + toUser + "]]></ToUserName>" +
                "<FromUserName><![CDATA[xiaoyun]]></FromUserName>" +
                "<CreateTime>" + System.currentTimeMillis() / 1000 + "</CreateTime>" +
                "<MsgType><![CDATA[text]]></MsgType>" +
                "<Content><![CDATA[" + content + "]]></Content>" +
                "</xml>";
    }

    private String extractXmlValue(String xml, String tag) {
        String start2 = "<" + tag + "><![CDATA[";
        String end2 = "]]></" + tag + ">";
        int idx2 = xml.indexOf(start2);
        if (idx2 >= 0) {
            int start = idx2 + start2.length();
            int end = xml.indexOf(end2, start);
            if (end >= 0) return xml.substring(start, end);
        }
        String start1 = "<" + tag + ">";
        String end1 = "</" + tag + ">";
        int idx1 = xml.indexOf(start1);
        if (idx1 >= 0) {
            int start = idx1 + start1.length();
            int end = xml.indexOf(end1, start);
            if (end >= 0) return xml.substring(start, end);
        }
        return null;
    }
}
