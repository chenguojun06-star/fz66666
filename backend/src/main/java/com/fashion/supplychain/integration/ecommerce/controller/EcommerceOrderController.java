package com.fashion.supplychain.integration.ecommerce.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.entity.EcGiftRule;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcommerceOrderOrchestrator;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcOrderMergeOrchestrator;
import com.fashion.supplychain.integration.ecommerce.service.EcGiftRuleService;
import com.fashion.supplychain.system.service.EcPlatformConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import com.fasterxml.jackson.databind.ObjectMapper;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
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

    @Autowired
    private EcOrderMergeOrchestrator mergeOrchestrator;

    @Autowired
    private EcGiftRuleService giftRuleService;

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
            if (appKey == null || appKey.isBlank()) {
                log.warn("[EC Webhook] 拒绝缺少 X-App-Key 的请求: platform={}", platform);
                return Result.fail("缺少 X-App-Key");
            }
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

    // ==================== Phase 2: 订单深加工 ====================

    /** 查询合单候选组（同收货人+同平台+待发货，≥2笔） */
    @GetMapping("/merge-candidates")
    public Result<List<EcOrderMergeOrchestrator.MergeGroup>> mergeCandidates() {
        Long tenantId = UserContext.tenantId();
        return Result.success(mergeOrchestrator.scanMergeCandidates(tenantId));
    }

    /** 合单发货：给多笔订单设置同一快递单号 */
    @PostMapping("/merge-outbound")
    public Result<EcOrderMergeOrchestrator.MergeResult> mergeOutbound(@RequestBody Map<String, Object> body) {
        try {
            Long tenantId = UserContext.tenantId();
            @SuppressWarnings("unchecked")
            List<Integer> orderIdsRaw = (List<Integer>) body.get("orderIds");
            if (orderIdsRaw == null || orderIdsRaw.isEmpty()) {
                return Result.fail("订单ID列表不能为空");
            }
            List<Long> orderIds = orderIdsRaw.stream().map(Number::longValue).toList();
            String trackingNo = (String) body.get("trackingNo");
            String expressCompany = (String) body.get("expressCompany");
            return Result.success(mergeOrchestrator.batchOutbound(tenantId, orderIds, trackingNo, expressCompany));
        } catch (Exception e) {
            log.error("[合单发货失败] {}", e.getMessage());
            return Result.fail("合单失败: " + e.getMessage());
        }
    }

    /** 查询赠品规则列表 */
    @GetMapping("/gift-rules")
    public Result<List<EcGiftRule>> listGiftRules() {
        Long tenantId = UserContext.tenantId();
        return Result.success(giftRuleService.listByTenant(tenantId));
    }

    /** 保存赠品规则（新增/更新） */
    @PostMapping("/gift-rules")
    public Result<EcGiftRule> saveGiftRule(@RequestBody EcGiftRule rule) {
        Long tenantId = UserContext.tenantId();
        rule.setTenantId(tenantId);
        if (rule.getEnabled() == null) rule.setEnabled(1);
        if (rule.getDeleteFlag() == null) rule.setDeleteFlag(0);
        if (rule.getGiftQuantity() == null) rule.setGiftQuantity(1);
        giftRuleService.saveOrUpdate(rule);
        return Result.success(rule);
    }

    /** 删除赠品规则（软删除） */
    @DeleteMapping("/gift-rules/{id}")
    public Result<Void> deleteGiftRule(@PathVariable Long id) {
        Long tenantId = UserContext.tenantId();
        giftRuleService.softDelete(tenantId, id);
        return Result.success(null);
    }

    /** 匹配赠品：根据订单金额/数量/平台返回命中的赠品 */
    @PostMapping("/gift-rules/match")
    public Result<List<EcGiftRuleService.GiftMatch>> matchGifts(@RequestBody Map<String, Object> body) {
        Long tenantId = UserContext.tenantId();
        BigDecimal amount = body.get("orderAmount") != null
                ? new BigDecimal(body.get("orderAmount").toString()) : null;
        Integer qty = body.get("orderQuantity") != null
                ? Integer.valueOf(body.get("orderQuantity").toString()) : null;
        String platform = (String) body.get("platformCode");
        return Result.success(giftRuleService.matchGifts(tenantId, amount, qty, platform));
    }

    private Long resolveTenantFromConfig(String platform, String appKey) {
        if (appKey != null && !appKey.isBlank()) {
            var config = ecPlatformConfigService.getByAppKey(appKey);
            if (config != null && platform.equalsIgnoreCase(config.getPlatformCode())) {
                return config.getTenantId();
            }
        }
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
