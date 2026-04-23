package com.fashion.supplychain.wechat.service;

import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.service.TenantService;
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
 * 企业微信群机器人 Webhook 推送服务
 *
 * <p>通过企业微信群机器人 Webhook 将关键生产事件实时推送到工作群。
 * 适用场景：逾期预警、停滞订单、AI 异常检测、物料告警等。
 *
 * <p>配置方式（application.yml 或环境变量）：
 * <pre>
 * wechat:
 *   work:
 *     webhook-url: ${WECHAT_WORK_WEBHOOK_URL:}   # 企业微信群机器人 Webhook 地址
 *     enabled: ${WECHAT_WORK_NOTIFY_ENABLED:false}
 * </pre>
 *
 * <p>获取 Webhook：在企业微信群 → 右键「群设置」→「群机器人」→「添加机器人」→ 复制 Webhook URL
 *
 * <p>安全说明：
 * - webhook-url 含鉴权 key，禁止写入代码或日志，只通过环境变量注入
 * - 所有 HTTP 调用异步捕获异常，绝不影响主业务流程
 *
 * <p>企业微信 Webhook API 文档：
 * https://developer.work.weixin.qq.com/document/path/91770
 */
@Slf4j
@Service
public class WechatWorkNotifyService {

    private static final int CONNECT_TIMEOUT_MS = 3000;
    private static final int READ_TIMEOUT_MS = 5000;

    @Value("${wechat.work.webhook-url:}")
    private String webhookUrl;

    @Value("${wechat.work.enabled:false}")
    private boolean enabled;

    private final RestTemplate restTemplate;

    /** 租户 Service，用于查询租户独立 Webhook 配置（Spring 延迟注入，避免循环依赖） */
    @Autowired(required = false)
    private TenantService tenantService;

    public WechatWorkNotifyService() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(CONNECT_TIMEOUT_MS);
        factory.setReadTimeout(READ_TIMEOUT_MS);
        this.restTemplate = new RestTemplate(factory);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 对外公开接口
    // ──────────────────────────────────────────────────────────────────────

    /**
     * 发送 Markdown 消息到企业微信群
     *
     * <p>内容支持企业微信 Markdown 语法：
     * **加粗** / <font color="warning">橙色</font> / <font color="info">绿色</font>
     *
     * @param content Markdown 正文（建议不超过 4096 字符）
     */
    public void sendMarkdown(String content) {
        if (!isConfigured()) return;

        Map<String, Object> body = new HashMap<>();
        body.put("msgtype", "markdown");

        Map<String, String> markdownBody = new HashMap<>();
        markdownBody.put("content", content);
        body.put("markdown", markdownBody);

        doPost(body, "markdown");
    }

    /**
     * 发送订单预警通知（逾期 / 停滞 / AI 检测异常）
     *
     * @param orderNo    订单号
     * @param styleNo    款号（可为 null）
     * @param alertType  类型标识：deadline / stagnant / anomaly / danger_alert
     * @param detail     补充说明（如"距交期仅剩 2 天，当前进度 35%"）
     */
    public void sendOrderAlert(String orderNo, String styleNo, String alertType, String detail) {
        if (!isConfigured()) return;

        String emoji = alertEmojiFor(alertType);
        String label = alertLabelFor(alertType);
        String styleInfo = (styleNo != null && !styleNo.isBlank()) ? "，款号：" + styleNo : "";

        String content = String.format(
                "%s **%s — 订单 %s%s**\n>%s",
                emoji, label, orderNo, styleInfo, detail);
        sendMarkdown(content);
    }

    /**
     * 发送纯文本消息（适合简单通知）
     *
     * @param text 通知正文
     */
    public void sendText(String text) {
        if (!isConfigured()) return;

        Map<String, Object> body = new HashMap<>();
        body.put("msgtype", "text");

        Map<String, Object> textBody = new HashMap<>();
        textBody.put("content", text);
        body.put("text", textBody);

        doPost(body, "text");
    }

    // ──────────────────────────────────────────────────────────────────────
    // 租户级接口（优先使用租户独立 Webhook，无则回退全局配置）
    // ──────────────────────────────────────────────────────────────────────

    /**
     * 向指定租户的企业微信群发送订单预警（使用该租户自己配置的 Webhook）
     *
     * <p>若租户未配置独立 Webhook，则回退到全局 {@code wechat.work.webhook-url} 配置。
     * 若全局也未配置，静默跳过，不影响主业务。
     */
    public void sendOrderAlertForTenant(Long tenantId, String orderNo, String styleNo,
                                         String alertType, String detail) {
        String url = resolveWebhookUrl(tenantId);
        if (url == null || url.isBlank()) return;

        String emoji = alertEmojiFor(alertType);
        String label = alertLabelFor(alertType);
        String styleInfo = (styleNo != null && !styleNo.isBlank()) ? "，款号：" + styleNo : "";
        String content = String.format("%s **%s — 订单 %s%s**\n>%s",
                emoji, label, orderNo, styleInfo, detail);

        doPostToUrl(url, buildMarkdownBody(content), "markdown");
    }

    /**
     * 向指定租户的企业微信群发送 Markdown 消息
     *
     * <p>若租户未配置独立 Webhook，则回退到全局配置；均为空时静默跳过。
     */
    public void sendMarkdownForTenant(Long tenantId, String content) {
        String url = resolveWebhookUrl(tenantId);
        if (url == null || url.isBlank()) return;
        doPostToUrl(url, buildMarkdownBody(content), "markdown");
    }

    /**
     * 解析租户 Webhook URL：优先取租户独立配置，无则回退全局配置
     */
    private String resolveWebhookUrl(Long tenantId) {
        if (!enabled) return null;
        if (tenantId != null && tenantService != null) {
            try {
                Tenant tenant = tenantService.getById(tenantId);
                if (tenant != null && tenant.getWechatWorkWebhookUrl() != null
                        && !tenant.getWechatWorkWebhookUrl().isBlank()) {
                    return tenant.getWechatWorkWebhookUrl();
                }
            } catch (Exception e) {
                log.warn("[WechatWork] 查询租户 Webhook 失败，降级使用全局配置 tenantId={} error={}",
                        tenantId, e.getMessage());
            }
        }
        // 回退到全局配置
        return (webhookUrl != null && !webhookUrl.isBlank()) ? webhookUrl : null;
    }

    private Map<String, Object> buildMarkdownBody(String content) {
        Map<String, Object> body = new HashMap<>();
        body.put("msgtype", "markdown");
        Map<String, String> md = new HashMap<>();
        md.put("content", content);
        body.put("markdown", md);
        return body;
    }

    // ──────────────────────────────────────────────────────────────────────
    // 内部实现
    // ──────────────────────────────────────────────────────────────────────

    /**
     * 判断是否已配置且已启用（留空 webhook-url 或 enabled=false 时静默跳过）
     */
    public boolean isConfigured() {
        return enabled && webhookUrl != null && !webhookUrl.isBlank();
    }

    /**
     * 执行 HTTP POST 推送（使用全局 webhookUrl），所有异常静默捕获，不阻断主业务流程
     */
    private void doPost(Map<String, Object> body, String msgType) {
        doPostToUrl(webhookUrl, body, msgType);
    }

    /**
     * 执行 HTTP POST 推送到指定 URL，所有异常静默捕获，不阻断主业务流程
     */
    private void doPostToUrl(String url, Map<String, Object> body, String msgType) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> request = new HttpEntity<>(body, headers);

            ResponseEntity<Map<String, Object>> response = restTemplate.exchange(
                    url, HttpMethod.POST, request,
                    new org.springframework.core.ParameterizedTypeReference<Map<String, Object>>() {});

            if (response.getStatusCode().is2xxSuccessful()) {
                Object errcode = response.getBody() != null ? response.getBody().get("errcode") : null;
                if (errcode != null && !Integer.valueOf(0).equals(errcode)) {
                    log.warn("[WechatWork] 推送失败 errcode={} errmsg={} msgType={}",
                            errcode,
                            response.getBody().get("errmsg"),
                            msgType);
                } else {
                    log.debug("[WechatWork] 推送成功 msgType={}", msgType);
                }
            } else {
                log.warn("[WechatWork] HTTP 非 2xx 响应 status={} msgType={}", response.getStatusCode(), msgType);
            }
        } catch (Exception e) {
            // 企业微信推送失败不影响业务主流程，仅记录 WARN 日志
            log.warn("[WechatWork] 推送异常（不影响业务），msgType={} error={}", msgType, e.getMessage());
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
