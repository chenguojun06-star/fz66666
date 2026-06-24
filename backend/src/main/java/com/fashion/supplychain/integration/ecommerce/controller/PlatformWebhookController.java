package com.fashion.supplychain.integration.ecommerce.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcommerceOrderOrchestrator;
import com.fashion.supplychain.integration.ecommerce.service.PlatformDataMapperService;
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import com.fashion.supplychain.system.service.EcPlatformConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.*;

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
            log.warn("[Webhook] 租户{}平台{}未配置，跳过", tenantId, code);
            return ResponseEntity.ok(Map.of("received", false, "reason", "platform not configured"));
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
            Map<String, Object> result = ecommerceOrderOrchestrator.receiveOrder(code, orderBody, config.getTenantId());

            if (Boolean.TRUE.equals(result.get("duplicate"))) {
                return ResponseEntity.ok(Map.of("received", true, "duplicate", true,
                        "orderNo", result.get("orderNo")));
            }
            return ResponseEntity.ok(Map.of("received", true, "duplicate", false,
                    "orderNo", result.get("orderNo"), "id", result.get("id")));
        } catch (Exception e) {
            log.error("[Webhook] 平台{}订单处理失败: {}", code, e.getMessage());
            return ResponseEntity.ok(Map.of("received", false, "error", e.getMessage()));
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