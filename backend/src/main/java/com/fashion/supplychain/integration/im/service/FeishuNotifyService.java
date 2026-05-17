package com.fashion.supplychain.integration.im.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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
 * 飞书群机器人 Webhook 推送服务
 *
 * <p>通过飞书自定义机器人 Webhook 将关键生产事件实时推送到飞书群。
 * 适用场景：逾期预警、停滞订单、AI 异常检测、物料告警等。
 *
 * <p>配置方式（优先级：租户DB > 环境变量）：
 * <ol>
 *   <li>租户在后台「集成中心 → IM通知」粘贴 Webhook URL → 存DB</li>
 *   <li>全局兜底：FEISHU_WEBHOOK_URL 环境变量</li>
 * </ol>
 *
 * <p>获取 Webhook：飞书群 → 设置 → 群机器人 → 添加自定义机器人 → 复制 Webhook URL
 *
 * <p>安全说明：
 * - webhook-url 含鉴权 key，禁止写入代码或日志，只通过环境变量注入
 * - 所有 HTTP 调用异步捕获异常，绝不影响主业务流程
 *
 * <p>飞书自定义机器人 Webhook 文档：
 * https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot
 */
@Slf4j
@Service
public class FeishuNotifyService {

    private static final int CONNECT_TIMEOUT_MS = 3000;
    private static final int READ_TIMEOUT_MS = 5000;

    @Autowired(required = false)
    private TenantMapper tenantMapper;

    @Value("${feishu.notify.webhook-url:}")
    private String globalWebhookUrl;

    @Value("${feishu.notify.enabled:true}")
    private boolean globalEnabled;

    private final RestTemplate restTemplate;

    public FeishuNotifyService() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(CONNECT_TIMEOUT_MS);
        factory.setReadTimeout(READ_TIMEOUT_MS);
        this.restTemplate = new RestTemplate(factory);
    }

    public void sendText(String text) {
        if (!isConfigured()) return;

        Map<String, Object> body = new HashMap<>();
        body.put("msg_type", "text");

        Map<String, String> textContent = new HashMap<>();
        textContent.put("text", text);
        body.put("content", textContent);

        doPost(body, "text");
    }

    public void sendOrderAlert(String orderNo, String styleNo, String alertType, String detail) {
        if (!isConfigured()) return;

        String emoji = alertEmojiFor(alertType);
        String label = alertLabelFor(alertType);
        String styleInfo = (styleNo != null && !styleNo.isBlank()) ? "，款号：" + styleNo : "";

        String text = String.format("%s %s — 订单 %s%s\n%s",
                emoji, label, orderNo, styleInfo, detail);
        sendText(text);
    }

    public void sendPost(String title, String content) {
        if (!isConfigured()) return;

        Map<String, Object> body = new HashMap<>();
        body.put("msg_type", "post");

        Map<String, Object> postContent = new HashMap<>();
        Map<String, Object> zhCn = new HashMap<>();
        zhCn.put("title", title);

        java.util.List<java.util.List<Map<String, Object>>> paragraphs = new java.util.ArrayList<>();
        java.util.List<Map<String, Object>> paragraph = new java.util.ArrayList<>();
        Map<String, Object> textTag = new HashMap<>();
        textTag.put("tag", "text");
        textTag.put("text", content);
        paragraph.add(textTag);
        paragraphs.add(paragraph);

        zhCn.put("content", paragraphs);
        postContent.put("zh_cn", zhCn);
        body.put("content", new HashMap<String, Object>() {{
            put("post", postContent);
        }});

        doPost(body, "post");
    }

    public void sendOrderAlertForTenant(Long tenantId, String orderNo, String styleNo,
                                         String alertType, String detail) {
        String url = resolveWebhookUrl(tenantId);
        if (url == null || url.isBlank()) return;

        String emoji = alertEmojiFor(alertType);
        String label = alertLabelFor(alertType);
        String styleInfo = (styleNo != null && !styleNo.isBlank()) ? "，款号：" + styleNo : "";
        String text = String.format("%s %s — 订单 %s%s\n%s",
                emoji, label, orderNo, styleInfo, detail);

        Map<String, Object> body = new HashMap<>();
        body.put("msg_type", "text");
        Map<String, String> textContent = new HashMap<>();
        textContent.put("text", text);
        body.put("content", textContent);

        doPostToUrl(url, body, "text");
    }

    public void sendTextForTenant(Long tenantId, String text) {
        String url = resolveWebhookUrl(tenantId);
        if (url == null || url.isBlank()) return;

        Map<String, Object> body = new HashMap<>();
        body.put("msg_type", "text");
        Map<String, String> textContent = new HashMap<>();
        textContent.put("text", text);
        body.put("content", textContent);

        doPostToUrl(url, body, "text");
    }

    public void sendPostForTenant(Long tenantId, String title, String content) {
        String url = resolveWebhookUrl(tenantId);
        if (url == null || url.isBlank()) return;

        Map<String, Object> body = new HashMap<>();
        body.put("msg_type", "post");

        Map<String, Object> postContent = new HashMap<>();
        Map<String, Object> zhCn = new HashMap<>();
        zhCn.put("title", title);

        java.util.List<java.util.List<Map<String, Object>>> paragraphs = new java.util.ArrayList<>();
        java.util.List<Map<String, Object>> paragraph = new java.util.ArrayList<>();
        Map<String, Object> textTag = new HashMap<>();
        textTag.put("tag", "text");
        textTag.put("text", content);
        paragraph.add(textTag);
        paragraphs.add(paragraph);

        zhCn.put("content", paragraphs);
        postContent.put("zh_cn", zhCn);
        body.put("content", new HashMap<String, Object>() {{
            put("post", postContent);
        }});

        doPostToUrl(url, body, "post");
    }

    private String resolveWebhookUrl(Long tenantId) {
        if (tenantId != null && tenantMapper != null) {
            Tenant tenant = tenantMapper.selectById(tenantId);
            if (tenant != null && tenant.getFeishuWebhookUrl() != null
                    && !tenant.getFeishuWebhookUrl().isBlank()) {
                return tenant.getFeishuWebhookUrl();
            }
        }
        if (!globalEnabled) return null;
        return (globalWebhookUrl != null && !globalWebhookUrl.isBlank()) ? globalWebhookUrl : null;
    }

    public boolean isConfigured() {
        return globalEnabled && globalWebhookUrl != null && !globalWebhookUrl.isBlank();
    }

    public boolean isConfiguredForTenant(Long tenantId) {
        if (tenantId != null && tenantMapper != null) {
            Tenant tenant = tenantMapper.selectById(tenantId);
            if (tenant != null && tenant.getFeishuWebhookUrl() != null
                    && !tenant.getFeishuWebhookUrl().isBlank()) {
                return true;
            }
        }
        return isConfigured();
    }

    private void doPost(Map<String, Object> body, String msgType) {
        doPostToUrl(globalWebhookUrl, body, msgType);
    }

    private void doPostToUrl(String url, Map<String, Object> body, String msgType) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

            ResponseEntity<Map> response = restTemplate.exchange(
                    url, HttpMethod.POST, request, Map.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                Object code = response.getBody() != null ? response.getBody().get("code") : null;
                if (code != null && !Integer.valueOf(0).equals(code)) {
                    log.warn("[Feishu] 推送失败 code={} msg={} msgType={}",
                            code, response.getBody().get("msg"), msgType);
                } else {
                    log.debug("[Feishu] 推送成功 msgType={}", msgType);
                }
            } else {
                log.warn("[Feishu] HTTP 非 2xx 响应 status={} msgType={}", response.getStatusCode(), msgType);
            }
        } catch (Exception e) {
            log.warn("[Feishu] 推送异常（不影响业务），msgType={} error={}", msgType, e.getMessage());
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