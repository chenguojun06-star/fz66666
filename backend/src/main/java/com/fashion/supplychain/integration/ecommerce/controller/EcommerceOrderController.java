package com.fashion.supplychain.integration.ecommerce.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcommerceOrderOrchestrator;
import com.fashion.supplychain.system.service.EcPlatformConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import com.fasterxml.jackson.databind.ObjectMapper;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/ecommerce")
@PreAuthorize("isAuthenticated()")
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
public class EcommerceOrderController {

    @Autowired
    private EcommerceOrderOrchestrator orchestrator;

    @Autowired
    private EcPlatformConfigService ecPlatformConfigService;

    private static final long WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
    private static final ObjectMapper objectMapper = new ObjectMapper();

    @PostMapping("/webhook/{platform}")
    @PreAuthorize("permitAll")
    public Result<Map<String, Object>> receiveWebhook(
            @PathVariable String platform,
            @RequestHeader(value = "X-Timestamp", required = false) String timestamp,
            @RequestHeader(value = "X-Signature", required = false) String signature,
            @RequestHeader(value = "X-App-Key", required = false) String appKey,
            @RequestBody Map<String, Object> body) {
        try {
            Long tenantId = resolveTenantFromConfig(platform, appKey);
            if (tenantId == null) {
                log.warn("[EC Webhook] 无法识别平台来源: platform={}, appKey={}", platform, appKey);
                return Result.fail("未配置的平台或无效的AppKey");
            }
            if (!verifyWebhookSignature(platform, tenantId, timestamp, signature, body)) {
                log.warn("[EC Webhook] 签名验证失败: platform={}, appKey={}", platform, appKey);
                return Result.fail("签名验证失败");
            }
            Map<String, Object> result = orchestrator.receiveOrder(platform, body, tenantId);
            return Result.success(result);
        } catch (Exception e) {
            log.error("[EC Webhook 失败] platform={} err={}", platform, e.getMessage());
            return Result.fail("接收失败: " + e.getMessage());
        }
    }

    @PostMapping("/orders/list")
    public Result<IPage<EcommerceOrder>> listOrders(@RequestBody Map<String, Object> params) {
        try {
            return Result.success(orchestrator.listOrders(params));
        } catch (Exception e) {
            log.error("[EC列表失败] {}", e.getMessage());
            return Result.fail("查询失败: " + e.getMessage());
        }
    }

    @PostMapping("/orders/{id}/link")
    public Result<Void> linkProductionOrder(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        try {
            String productionOrderNo = (String) body.get("productionOrderNo");
            orchestrator.linkProductionOrder(id, productionOrderNo);
            return Result.success(null);
        } catch (Exception e) {
            log.error("[EC关联失败] id={} err={}", id, e.getMessage());
            return Result.fail("关联失败: " + e.getMessage());
        }
    }

    @PostMapping("/orders/{id}/direct-outbound")
    public Result<Void> directOutbound(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        try {
            String trackingNo = (String) body.get("trackingNo");
            String expressCompany = (String) body.get("expressCompany");
            orchestrator.directOutbound(id, trackingNo, expressCompany);
            return Result.success(null);
        } catch (Exception e) {
            log.error("[EC直接出库失败] id={} err={}", id, e.getMessage());
            return Result.fail("出库失败: " + e.getMessage());
        }
    }

    private Long resolveTenantFromConfig(String platform, String appKey) {
        if (appKey != null) {
            var config = ecPlatformConfigService.getByAppKey(appKey);
            if (config != null) return config.getTenantId();
        }
        var configs = ecPlatformConfigService.listByPlatformCode(platform);
        if (!configs.isEmpty()) return configs.get(0).getTenantId();
        return null;
    }

    private boolean verifyWebhookSignature(String platform, Long tenantId,
                                            String timestamp, String signature,
                                            Map<String, Object> body) {
        if (signature == null || timestamp == null) {
            log.warn("[EC Webhook] 拒绝无签名头的请求: platform={}, tenantId={}", platform, tenantId);
            return false;
        }
        try {
            long ts = Long.parseLong(timestamp);
            if (Math.abs(System.currentTimeMillis() - ts * 1000) > WEBHOOK_TIMESTAMP_TOLERANCE_MS) {
                log.warn("[EC Webhook] 时间戳过期: platform={}, ts={}", platform, timestamp);
                return false;
            }
        } catch (NumberFormatException e) {
            log.warn("[EC Webhook] 时间戳格式错误: {}", timestamp);
            return false;
        }
        var config = ecPlatformConfigService.getByTenantAndPlatform(tenantId, platform);
        if (config == null || config.getAppSecret() == null) {
            log.error("[EC Webhook] 平台未配置密钥，拒绝请求: platform={}, tenantId={}", platform, tenantId);
            return false;
        }
        try {
            String bodyStr = objectMapper.writeValueAsString(body);
            String expected = hmacSha256(config.getAppSecret(), timestamp + bodyStr);
            if (!expected.equals(signature)) {
                log.warn("[EC Webhook] HMAC签名不匹配: platform={}", platform);
                return false;
            }
        } catch (Exception e) {
            log.warn("[EC Webhook] 签名计算异常: {}", e.getMessage());
            return false;
        }
        return true;
    }

    private String hmacSha256(String secret, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] bytes = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException("签名计算失败", e);
        }
    }
}
