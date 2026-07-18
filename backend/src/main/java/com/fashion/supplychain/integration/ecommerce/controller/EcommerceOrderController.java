package com.fashion.supplychain.integration.ecommerce.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.entity.EcGiftRule;
import com.fashion.supplychain.integration.ecommerce.entity.EcLogisticsAnomaly;
import com.fashion.supplychain.integration.ecommerce.entity.EcPlatformBill;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcommerceOrderOrchestrator;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcOrderMergeOrchestrator;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcLogisticsAnomalyOrchestrator;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcBillReconciliationOrchestrator;
import com.fashion.supplychain.integration.ecommerce.service.EcGiftRuleService;
import com.fashion.supplychain.integration.ecommerce.service.EcLogisticsAnomalyService;
import com.fashion.supplychain.integration.ecommerce.service.EcPlatformBillService;
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

    @Autowired
    private EcLogisticsAnomalyOrchestrator logisticsAnomalyOrchestrator;

    @Autowired
    private EcLogisticsAnomalyService logisticsAnomalyService;

    @Autowired
    private EcBillReconciliationOrchestrator billReconciliationOrchestrator;

    @Autowired
    private EcPlatformBillService platformBillService;

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

    /**
     * 销售数据统计（按日期范围汇总销售额、订单量、运费、净收入及平台分组）
     */
    @GetMapping("/sales-stats")
    public Result<Map<String, Object>> salesStats(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        try {
            return Result.success(orchestrator.calcSalesStats(startDate, endDate));
        } catch (Exception e) {
            log.error("[EC销售统计失败] startDate={}, endDate={}", startDate, endDate, e);
            return Result.fail("查询销售统计失败: " + e.getMessage());
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

    // ==================== Phase 3: 物流异常预警 ====================

    /** 扫描物流异常：扫描在途订单，生成异常预警 */
    @PostMapping("/logistics/anomaly-scan")
    public Result<Integer> scanLogisticsAnomalies() {
        try {
            int created = logisticsAnomalyOrchestrator.scanAnomalies();
            return Result.success(created);
        } catch (Exception e) {
            log.error("[物流异常扫描失败] {}", e.getMessage());
            return Result.fail("扫描失败: " + e.getMessage());
        }
    }

    /** 查询物流异常列表 */
    @GetMapping("/logistics/anomalies")
    public Result<List<EcLogisticsAnomaly>> listAnomalies(
            @RequestParam(value = "unhandledOnly", defaultValue = "true") boolean unhandledOnly) {
        Long tenantId = UserContext.tenantId();
        return Result.success(unhandledOnly
                ? logisticsAnomalyService.listUnhandled(tenantId)
                : logisticsAnomalyService.listAll(tenantId));
    }

    /** 处理物流异常（标记已处理） */
    @PostMapping("/logistics/anomalies/{id}/handle")
    public Result<Void> handleAnomaly(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        try {
            Long tenantId = UserContext.tenantId();
            String handledBy = UserContext.username();
            String remark = (String) body.get("remark");
            logisticsAnomalyService.markHandled(tenantId, id, handledBy, remark);
            return Result.success(null);
        } catch (Exception e) {
            log.error("[处理物流异常失败] id={} err={}", id, e.getMessage());
            return Result.fail("处理失败: " + e.getMessage());
        }
    }

    /** 忽略物流异常 */
    @PostMapping("/logistics/anomalies/{id}/ignore")
    public Result<Void> ignoreAnomaly(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        try {
            Long tenantId = UserContext.tenantId();
            String handledBy = UserContext.username();
            String remark = (String) body.get("remark");
            logisticsAnomalyService.markIgnored(tenantId, id, handledBy, remark);
            return Result.success(null);
        } catch (Exception e) {
            log.error("[忽略物流异常失败] id={} err={}", id, e.getMessage());
            return Result.fail("操作失败: " + e.getMessage());
        }
    }

    // ==================== Phase 3: 平台账单对账 ====================

    /** 触发账单对账：拉取平台账单并与本地收入比对 */
    @PostMapping("/bill/reconcile")
    public Result<EcBillReconciliationOrchestrator.ReconcileResult> reconcile(
            @RequestBody(required = false) Map<String, Object> body) {
        try {
            String platform = body != null ? (String) body.get("platform") : null;
            String billPeriod = body != null ? (String) body.get("billPeriod") : null;
            return Result.success(billReconciliationOrchestrator.reconcile(platform, billPeriod));
        } catch (Exception e) {
            log.error("[账单对账失败] {}", e.getMessage());
            return Result.fail("对账失败: " + e.getMessage());
        }
    }

    /** 查询账单列表 */
    @GetMapping("/bills")
    public Result<List<EcPlatformBill>> listBills(
            @RequestParam(value = "pendingOnly", defaultValue = "true") boolean pendingOnly,
            @RequestParam(value = "billPeriod", required = false) String billPeriod) {
        Long tenantId = UserContext.tenantId();
        if (billPeriod != null && !billPeriod.isBlank()) {
            return Result.success(platformBillService.listByPeriod(tenantId, billPeriod));
        }
        return Result.success(pendingOnly
                ? platformBillService.listPending(tenantId)
                : platformBillService.listAll(tenantId));
    }

    /** 处理账单差异（1已确认/2已申诉/3已忽略） */
    @PostMapping("/bills/{id}/handle")
    public Result<Void> handleBill(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        try {
            Long tenantId = UserContext.tenantId();
            String handledBy = UserContext.username();
            int status = body.get("status") != null
                    ? Integer.valueOf(body.get("status").toString()) : 1;
            if (status < 1 || status > 3) {
                return Result.fail("处理状态不合法，仅支持 1=已确认 / 2=已申诉 / 3=已忽略");
            }
            String remark = (String) body.get("remark");
            platformBillService.markHandled(tenantId, id, status, handledBy, remark);
            return Result.success(null);
        } catch (Exception e) {
            log.error("[处理账单差异失败] id={} err={}", id, e.getMessage());
            return Result.fail("处理失败: " + e.getMessage());
        }
    }

    // ==================== Phase 4: B2B 分销订单 ====================

    @Autowired
    private com.fashion.supplychain.integration.ecommerce.orchestration.B2BOrderOrchestrator b2BOrderOrchestrator;

    /** B2B 订单列表 */
    @GetMapping("/b2b/orders")
    public Result<List<EcommerceOrder>> listB2BOrders(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String distributorLevel,
            @RequestParam(required = false) Integer status) {
        return Result.success(b2BOrderOrchestrator.listB2BOrders(keyword, distributorLevel, status));
    }

    /** B2B 订单详情 */
    @GetMapping("/b2b/orders/{id}")
    public Result<EcommerceOrder> getB2BOrder(@PathVariable Long id) {
        return Result.success(b2BOrderOrchestrator.getB2BOrder(id));
    }

    /** 创建 B2B 订单（阶梯价自动匹配 + 账期额度占用） */
    @PostMapping("/b2b/orders")
    public Result<EcommerceOrder> createB2BOrder(@RequestBody EcommerceOrder order) {
        try {
            return Result.success(b2BOrderOrchestrator.createB2BOrder(order));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /** 取消 B2B 订单（释放额度） */
    @PostMapping("/b2b/orders/{id}/cancel")
    public Result<Void> cancelB2BOrder(@PathVariable Long id) {
        try {
            b2BOrderOrchestrator.cancelB2BOrder(id);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /** B2B 订单发货 */
    @PostMapping("/b2b/orders/{id}/ship")
    public Result<Void> shipB2BOrder(
            @PathVariable Long id,
            @RequestParam String trackingNo,
            @RequestParam String expressCompany) {
        try {
            b2BOrderOrchestrator.shipB2BOrder(id, trackingNo, expressCompany);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /** B2B 订单确认收货 */
    @PostMapping("/b2b/orders/{id}/confirm")
    public Result<Void> confirmB2BOrder(@PathVariable Long id) {
        try {
            b2BOrderOrchestrator.confirmB2BOrder(id);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    // ==================== Phase 4: 分销对账 ====================

    @Autowired
    private com.fashion.supplychain.integration.ecommerce.orchestration.DistributorBillReconciliationOrchestrator distributorBillOrchestrator;

    /** 触发分销对账 */
    @PostMapping("/distributor/bill/reconcile")
    public Result<com.fashion.supplychain.integration.ecommerce.orchestration.DistributorBillReconciliationOrchestrator.ReconcileResult> reconcileDistributorBills(
            @RequestParam(required = false) Long distributorId,
            @RequestParam(required = false) String billPeriod) {
        try {
            return Result.success(distributorBillOrchestrator.reconcile(distributorId, billPeriod));
        } catch (Exception e) {
            log.error("[分销对账失败] distributorId={} err={}", distributorId, e.getMessage());
            return Result.fail("对账失败: " + e.getMessage());
        }
    }

    /** 查询分销账单列表 */
    @GetMapping("/distributor/bills")
    public Result<List<EcPlatformBill>> listDistributorBills(
            @RequestParam(required = false) Long distributorId,
            @RequestParam(required = false) String billPeriod,
            @RequestParam(required = false, defaultValue = "false") boolean pendingOnly) {
        return Result.success(distributorBillOrchestrator.listBills(distributorId, billPeriod, pendingOnly));
    }

    /** 处理分销账单差异（复用 Phase 3 的 markHandled） */
    @PostMapping("/distributor/bills/{id}/handle")
    public Result<Void> handleDistributorBill(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        try {
            Long tenantId = UserContext.tenantId();
            String handledBy = UserContext.username();
            int status = body.get("status") != null
                    ? Integer.valueOf(body.get("status").toString()) : 1;
            if (status < 1 || status > 3) {
                return Result.fail("处理状态不合法，仅支持 1=已确认 / 2=已申诉 / 3=已忽略");
            }
            String remark = (String) body.get("remark");
            platformBillService.markHandled(tenantId, id, status, handledBy, remark);
            return Result.success(null);
        } catch (Exception e) {
            log.error("[处理分销账单失败] id={} err={}", id, e.getMessage());
            return Result.fail("处理失败: " + e.getMessage());
        }
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
