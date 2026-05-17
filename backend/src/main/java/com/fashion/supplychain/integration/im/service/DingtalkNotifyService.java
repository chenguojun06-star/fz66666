package com.fashion.supplychain.integration.im.service;

import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.mapper.TenantMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

/**
 * 钉钉群机器人 Webhook 推送服务
 *
 * <p>通过钉钉自定义机器人 Webhook 将关键生产事件实时推送到钉钉群。
 * 适用场景：逾期预警、停滞订单、AI 异常检测、物料告警等。
 *
 * <p>配置方式（优先级：租户DB > 环境变量）：
 * <ol>
 *   <li>租户在后台「集成中心 → IM通知」粘贴 Webhook URL → 存DB</li>
 *   <li>全局兜底：DINGTALK_WEBHOOK_URL 环境变量</li>
 * </ol>
 *
 * <p>获取 Webhook：钉钉群 → 群设置 → 智能群助手 → 添加机器人 → 自定义 → 复制 Webhook URL
 *
 * <p>安全说明：
 * - webhook-url 含 access_token，禁止写入代码或日志，只通过环境变量注入
 * - 所有 HTTP 调用异步捕获异常，绝不影响主业务流程
 * - 支持加签安全设置（secret），通过 DINGTALK_WEBHOOK_SECRET 环境变量配置
 *
 * <p>钉钉自定义机器人 Webhook 文档：
 * https://open.dingtalk.com/document/orgapp/custom-robot-access
 */
@Slf4j
@Service
public class DingtalkNotifyService {

    private static final int CONNECT_TIMEOUT_MS = 3000;
    private static final int READ_TIMEOUT_MS = 5000;

    @Autowired(required = false)
    private TenantMapper tenantMapper;

    @Value("${dingtalk.notify.webhook-url:}")
    private String globalWebhookUrl;

    @Value("${dingtalk.notify.enabled:true}")
    private boolean globalEnabled;

    @Value("${dingtalk.notify.secret:}")
    private String secret;

    private final RestTemplate restTemplate;

    public DingtalkNotifyService() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(CONNECT_TIMEOUT_MS);
        factory.setReadTimeout(READ_TIMEOUT_MS);
        this.restTemplate = new RestTemplate(factory);
    }

    public void sendText(String text) {
        if (!isConfigured()) return;

        Map<String, Object> body = new HashMap<>();
        body.put("msgtype", "text");

        Map<String, String> textContent = new HashMap<>();
        textContent.put("content", text);
        body.put("text", textContent);

        doPost(body, "text");
    }

    public void sendMarkdown(String title, String text) {
        if (!isConfigured()) return;

        Map<String, Object> body = new HashMap<>();
        body.put("msgtype", "markdown");

        Map<String, String> md = new HashMap<>();
        md.put("title", title);
        md.put("text", text);
        body.put("markdown", md);

        doPost(body, "markdown");
    }

    public void sendOrderAlert(String orderNo, String styleNo, String alertType, String detail) {
        if (!isConfigured()) return;

        String emoji = alertEmojiFor(alertType);
        String label = alertLabelFor(alertType);
        String styleInfo = (styleNo != null && !styleNo.isBlank()) ? "，款号：" + styleNo : "";

        String title = String.format("%s %s — 订单 %s", emoji, label, orderNo);
        String text = String.format("### %s %s — 订单 %s%s\n\n> %s",
                emoji, label, orderNo, styleInfo, detail);
        sendMarkdown(title, text);
    }

    public void sendOrderAlertForTenant(Long tenantId, String orderNo, String styleNo,
                                         String alertType, String detail) {
        String url = resolveWebhookUrl(tenantId);
        if (url == null || url.isBlank()) return;

        String emoji = alertEmojiFor(alertType);
        String label = alertLabelFor(alertType);
        String styleInfo = (styleNo != null && !styleNo.isBlank()) ? "，款号：" + styleNo : "";
        String title = String.format("%s %s — 订单 %s", emoji, label, orderNo);
        String text = String.format("### %s %s — 订单 %s%s\n\n> %s",
                emoji, label, orderNo, styleInfo, detail);

        Map<String, Object> body = new HashMap<>();
        body.put("msgtype", "markdown");
        Map<String, String> md = new HashMap<>();
        md.put("title", title);
        md.put("text", text);
        body.put("markdown", md);

        doPostToUrl(url, body, "markdown");
    }

    public void sendTextForTenant(Long tenantId, String text) {
        String url = resolveWebhookUrl(tenantId);
        if (url == null || url.isBlank()) return;

        Map<String, Object> body = new HashMap<>();
        body.put("msgtype", "text");
        Map<String, String> textContent = new HashMap<>();
        textContent.put("content", text);
        body.put("text", textContent);

        doPostToUrl(url, body, "text");
    }

    public void sendMarkdownForTenant(Long tenantId, String title, String text) {
        String url = resolveWebhookUrl(tenantId);
        if (url == null || url.isBlank()) return;

        Map<String, Object> body = new HashMap<>();
        body.put("msgtype", "markdown");
        Map<String, String> md = new HashMap<>();
        md.put("title", title);
        md.put("text", text);
        body.put("markdown", md);

        doPostToUrl(url, body, "markdown");
    }

    private String resolveWebhookUrl(Long tenantId) {
        String url = null;
        if (tenantId != null && tenantMapper != null) {
            Tenant tenant = tenantMapper.selectById(tenantId);
            if (tenant != null && tenant.getDingtalkWebhookUrl() != null
                    && !tenant.getDingtalkWebhookUrl().isBlank()) {
                url = tenant.getDingtalkWebhookUrl();
            }
        }
        if (url == null) {
            if (!globalEnabled) return null;
            url = (globalWebhookUrl != null && !globalWebhookUrl.isBlank()) ? globalWebhookUrl : null;
        }
        if (url == null) return null;
        if (secret != null && !secret.isBlank()) {
            url = signUrl(url);
        }
        return url;
    }

    private String signUrl(String url) {
        try {
            long timestamp = System.currentTimeMillis();
            String stringToSign = timestamp + "\n" + secret;
            javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
            javax.crypto.spec.SecretKeySpec spec =
                    new javax.crypto.spec.SecretKeySpec(secret.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                            "HmacSHA256");
            mac.init(spec);
            byte[] signData = mac.doFinal(stringToSign.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            String sign = java.util.Base64.getEncoder().encodeToString(signData);
            String encodedSign = java.net.URLEncoder.encode(sign, java.nio.charset.StandardCharsets.UTF_8);
            return url + "&timestamp=" + timestamp + "&sign=" + encodedSign;
        } catch (Exception e) {
            log.warn("[Dingtalk] 签名计算失败，使用原始 URL: {}", e.getMessage());
            return url;
        }
    }

    public boolean isConfigured() {
        return globalEnabled && globalWebhookUrl != null && !globalWebhookUrl.isBlank();
    }

    public boolean isConfiguredForTenant(Long tenantId) {
        if (tenantId != null && tenantMapper != null) {
            Tenant tenant = tenantMapper.selectById(tenantId);
            if (tenant != null && tenant.getDingtalkWebhookUrl() != null
                    && !tenant.getDingtalkWebhookUrl().isBlank()) {
                return true;
            }
        }
        return isConfigured();
    }

    private void doPost(Map<String, Object> body, String msgType) {
        String url = resolveWebhookUrl(null);
        if (url == null) return;
        doPostToUrl(url, body, msgType);
    }

    private void doPostToUrl(String url, Map<String, Object> body, String msgType) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

            ResponseEntity<Map> response = restTemplate.exchange(
                    url, HttpMethod.POST, request, Map.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                Object errcode = response.getBody() != null ? response.getBody().get("errcode") : null;
                if (errcode != null && !Long.valueOf(0).equals(errcode)) {
                    log.warn("[Dingtalk] 推送失败 errcode={} errmsg={} msgType={}",
                            errcode, response.getBody().get("errmsg"), msgType);
                } else {
                    log.debug("[Dingtalk] 推送成功 msgType={}", msgType);
                }
            } else {
                log.warn("[Dingtalk] HTTP 非 2xx 响应 status={} msgType={}", response.getStatusCode(), msgType);
            }
        } catch (Exception e) {
            log.warn("[Dingtalk] 推送异常（不影响业务），msgType={} error={}", msgType, e.getMessage());
        }
    }

    private String alertEmojiFor(String alertType) {
        if (alertType == null) return "📢";
        return switch (alertType) {
            case "deadline"     -> "🚨";
            case "stagnant"     -> "⏸️";
            case "anomaly"      -> "⚠️";
            case "danger_alert" -> "🔴";
            default             -> "📢";
        };
    }

    private String alertLabelFor(String alertType) {
        if (alertType == null) return "生产通知";
        return switch (alertType) {
            case "deadline"     -> "交期预警";
            case "stagnant"     -> "停滞预警";
            case "anomaly"      -> "AI 异常检测";
            case "danger_alert" -> "高风险订单";
            default             -> "生产通知";
        };
    }
}