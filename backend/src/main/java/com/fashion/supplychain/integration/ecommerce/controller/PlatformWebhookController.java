package com.fashion.supplychain.integration.ecommerce.controller;

import com.fashion.supplychain.integration.ecommerce.orchestration.EcommerceOrderOrchestrator;
import com.fashion.supplychain.integration.ecommerce.service.PlatformDataMapperService;
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import com.fashion.supplychain.system.service.EcPlatformConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * 电商平台订单推送入口（按租户 + 平台编码寻址）。
 *
 * <p>与 {@link EcommerceOrderController#receiveWebhook}（{@code /api/ecommerce/webhook/{platform}}，
 * 靠 X-App-Key 反查租户）是两条并存的入口：本入口租户由 URL 路径给出，签名头为
 * {@code X-Platform-Signature / X-Platform-Timestamp}，算法 HMAC-SHA256(appSecret, timestamp + body)。
 *
 * <p><b>状态码约定（平台只看状态码决定是否重推，务必与 EcommerceOrderController 保持一致）</b>：
 * <ul>
 *   <li>200 处理成功 / 幂等命中重复推送</li>
 *   <li>401 平台未配置、缺密钥、签名不匹配、缺签名头 —— 配置类错误，重试无意义，需人工修配置</li>
 *   <li>500 处理异常（DB 抖动等）—— 平台可安全重推，落库侧幂等</li>
 * </ul>
 * 历史坑：早期异常/未配置都返回 HTTP 200 + {@code received:false}，平台认为"已送达"不再重推，
 * 线上表现为"平台说推送成功、系统里没有单"。
 */
@Slf4j
@RestController
@RequestMapping("/api/webhook/ecommerce")
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class PlatformWebhookController {

    @Autowired
    private EcPlatformConfigService ecPlatformConfigService;

    @Autowired
    private EcommerceOrderOrchestrator ecommerceOrderOrchestrator;

    @Autowired
    private PlatformDataMapperService dataMapper;

    @PostMapping("/{tenantId}/{platformCode}")
    public ResponseEntity<?> receiveOrder(@RequestBody String body,
                                          @PathVariable Long tenantId,
                                          @PathVariable String platformCode,
                                          @RequestHeader(value = "X-Platform-Signature", required = false) String signature,
                                          @RequestHeader(value = "X-Platform-Timestamp", required = false) String timestamp) {
        String code = platformCode.toUpperCase();

        EcPlatformConfig config = ecPlatformConfigService.getByTenantAndPlatform(tenantId, code);
        if (config == null) {
            log.warn("[Webhook] 租户{}平台{}未配置，拒绝请求", tenantId, code);
            // 401：配置错误，重试无意义；但绝不能返回 200，否则平台认为"已送达"不再重推
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("received", false, "reason", "platform not configured"));
        }

        if (signature == null || timestamp == null) {
            log.warn("[Webhook] 租户{}平台{}缺少签名或时间戳头，拒绝请求", tenantId, code);
            return ResponseEntity.status(401).body(Map.of("error", "missing signature/timestamp"));
        }
        if (config.getAppSecret() == null) {
            log.warn("[Webhook] 租户{}平台{}未配置密钥，拒绝请求", tenantId, code);
            return ResponseEntity.status(401).body(Map.of("error", "app secret not configured"));
        }
        String expected = hmacSha256(config.getAppSecret(), timestamp + body);
        if (!expected.equals(signature)) {
            log.warn("[Webhook] 租户{}平台{}签名验证失败", tenantId, code);
            return ResponseEntity.status(401).body(Map.of("error", "signature mismatch"));
        }

        try {
            Map<String, Object> orderBody = dataMapper.mapToGeneric(code, body);
            // D-532：webhook 免登录但带 path tenantId——注入系统租户上下文，
            // 否则 UserContext 为空，receiveOrder 内依赖租户上下文的子调用
            // （TenantAssert/智能分仓/组合识别）全部异常导致整单回滚
            com.fashion.supplychain.common.UserContext webhookCtx = new com.fashion.supplychain.common.UserContext();
            webhookCtx.setTenantId(config.getTenantId());
            webhookCtx.setUserId("webhook-system");
            webhookCtx.setUsername("webhook:" + code);
            webhookCtx.setPermissionRange("all");
            com.fashion.supplychain.common.UserContext.set(webhookCtx);
            try {
                Map<String, Object> result = ecommerceOrderOrchestrator.receiveOrder(code, orderBody, config.getTenantId());

                if (Boolean.TRUE.equals(result.get("duplicate"))) {
                    return ResponseEntity.ok(Map.of("received", true, "duplicate", true,
                            "orderNo", result.get("orderNo")));
                }
                return ResponseEntity.ok(Map.of("received", true, "duplicate", false,
                        "orderNo", result.get("orderNo"), "id", result.get("id")));
            } finally {
                com.fashion.supplychain.common.UserContext.clear();
            }
        } catch (Exception e) {
            log.error("[Webhook] 平台{}订单处理失败: {}", code, e.getMessage(), e);
            // 500 → 平台会重推；落库侧按 (platformOrderNo, sourcePlatformCode, tenantId) 幂等去重。
            // 注意不要用 200 + received=false：平台只看状态码，那样订单会被静默丢弃。
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("received", false,
                            "error", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        }
    }

    private String hmacSha256(String key, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return "";
        }
    }
}