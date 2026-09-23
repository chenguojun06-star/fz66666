package com.fashion.supplychain.integration.ecommerce.service;

import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.sync.adapter.EcPlatformAdapter;
import com.fashion.supplychain.integration.sync.adapter.EcPlatformAdapterRegistry;
import com.fashion.supplychain.integration.sync.dto.EcStockPullResult;
import com.fashion.supplychain.integration.sync.dto.EcStockSyncItem;
import com.fashion.supplychain.integration.sync.dto.EcStockSyncResult;
import com.fashion.supplychain.integration.sync.dto.EcSyncContext;
import com.fashion.supplychain.integration.util.IntegrationHttpClient;
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import com.fashion.supplychain.system.service.EcPlatformConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

@Slf4j
@Service
public class PlatformNotifyService {

    @Autowired
    private EcPlatformConfigService ecPlatformConfigService;

    @Autowired
    private IntegrationHttpClient httpClient;

    /**
     * 平台适配器注册表（用于真实拉取/推送库存）。
     * required=false：集成模块未启用时本服务仍需可装配，不阻断主流程。
     */
    @Autowired(required = false)
    private EcPlatformAdapterRegistry platformAdapterRegistry;

    public void notifyShipped(EcommerceOrder order) {
        if (order == null || order.getTrackingNo() == null) {
            log.debug("[物流回调] 快递单号为空，跳过 ecOrderNo={}", order != null ? order.getOrderNo() : null);
            return;
        }
        // 说明：本方法只负责回传「调用方传入的运单号」，该运单号来自人工录入或真实渠道。
        // 系统自动下单产生的 Mock 运单号已在 LogisticsManager.createShipment 源头拦截，
        // 不会流入此处——故这里不做渠道级拦截，避免误伤人工录入的真实运单号。
        String platform = order.getSourcePlatformCode();
        if (!StringUtils.hasText(platform)) {
            log.info("[物流回调] 平台为空，跳过 ecOrderNo={}", order.getOrderNo());
            return;
        }
        try {
            EcPlatformConfig config = ecPlatformConfigService.getByTenantAndPlatform(
                    order.getTenantId(), platform);
            if (config == null || !"ACTIVE".equals(config.getStatus())) {
                log.info("[物流回调] 平台={} 未配置凭证或已禁用，跳过自动回传。快递单号={} 需人工处理",
                        platform, order.getTrackingNo());
                return;
            }
            if (!StringUtils.hasText(config.getAppKey()) || !StringUtils.hasText(config.getAppSecret())) {
                log.info("[物流回调] 平台={} 凭证不完整(AppKey/AppSecret为空)，跳过自动回传", platform);
                return;
            }
            notifyPlatform(config, order);
        } catch (Exception e) {
            log.warn("[物流回调] 回传失败 平台={} ecOrderNo={} 原因={}",
                    platform, order.getOrderNo(), e.getMessage());
        }
    }

    private void notifyPlatform(EcPlatformConfig config, EcommerceOrder order) {
        String platform = config.getPlatformCode();
        String callbackUrl = config.getCallbackUrl();
        if (StringUtils.hasText(callbackUrl)) {
            notifyViaCallbackUrl(config, order, callbackUrl);
            return;
        }
        switch (platform == null ? "" : platform) {
            case "TAOBAO", "TMALL" -> notifyTaobao(config, order);
            case "JD"              -> notifyJd(config, order);
            case "PINDUODUO"       -> notifyPdd(config, order);
            case "DOUYIN"          -> notifyDouyin(config, order);
            case "XIAOHONGSHU"     -> notifyXhs(config, order);
            case "WECHAT_SHOP"     -> notifyWechat(config, order);
            case "SHOPIFY"         -> notifyShopify(config, order);
            case "SHEIN"           -> notifyShein(config, order);
            case "JST"            -> notifyJst(config, order);
            default -> log.info("[物流回调] 平台={} 暂不支持自动回传，快递单号={} 需人工处理",
                    platform, order.getTrackingNo());
        }
    }

    private void notifyViaCallbackUrl(EcPlatformConfig config, EcommerceOrder order, String callbackUrl) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("platformOrderNo", order.getPlatformOrderNo());
        payload.put("orderNo", order.getOrderNo());
        payload.put("trackingNo", order.getTrackingNo());
        payload.put("expressCompany", order.getExpressCompany());
        payload.put("status", "shipped");
        payload.put("shippedAt", order.getShipTime() != null ? order.getShipTime().toString() : null);
        try {
            Map<String, String> headers = new LinkedHashMap<>();
            headers.put("X-App-Key", config.getAppKey());
            headers.put("X-Platform", config.getPlatformCode());
            httpClient.postJson(callbackUrl, payload, Map.class, headers);
            log.info("[物流回调] 通用回调成功 平台={} url={} platformOrderNo={}",
                    config.getPlatformCode(), callbackUrl, order.getPlatformOrderNo());
        } catch (Exception e) {
            log.warn("[物流回调] 通用回调失败 平台={} url={} 原因={}",
                    config.getPlatformCode(), callbackUrl, e.getMessage());
        }
    }

    private void notifyTaobao(EcPlatformConfig config, EcommerceOrder order) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("method", "logistic.offline.send");
        payload.put("app_key", config.getAppKey());
        payload.put("tid", order.getPlatformOrderNo());
        payload.put("out_sid", order.getTrackingNo());
        payload.put("company_name", order.getExpressCompany());
        payload.put("session", config.getExtraField());
        sendPlatformRequest("淘宝/天猫", config, payload);
    }

    private void notifyJd(EcPlatformConfig config, EcommerceOrder order) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("method", "jingdong.order.deliverEorder");
        payload.put("app_key", config.getAppKey());
        payload.put("jdOrderId", order.getPlatformOrderNo());
        payload.put("logisticsId", order.getTrackingNo());
        payload.put("accessToken", config.getExtraField());
        sendPlatformRequest("京东", config, payload);
    }

    private void notifyPdd(EcPlatformConfig config, EcommerceOrder order) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "pdd.logistics.ship");
        payload.put("client_id", config.getAppKey());
        payload.put("order_sn", order.getPlatformOrderNo());
        payload.put("logistics_name", order.getExpressCompany());
        payload.put("tracking_number", order.getTrackingNo());
        sendPlatformRequest("拼多多", config, payload);
    }

    private void notifyDouyin(EcPlatformConfig config, EcommerceOrder order) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("order_id", order.getPlatformOrderNo());
        payload.put("delivery_id", order.getTrackingNo());
        payload.put("company", order.getExpressCompany());
        payload.put("app_id", config.getAppKey());
        payload.put("access_token", config.getExtraField());
        sendPlatformRequest("抖音", config, payload);
    }

    private void notifyXhs(EcPlatformConfig config, EcommerceOrder order) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("order_id", order.getPlatformOrderNo());
        payload.put("tracking_no", order.getTrackingNo());
        payload.put("express_company", order.getExpressCompany());
        sendPlatformRequest("小红书", config, payload);
    }

    private void notifyWechat(EcPlatformConfig config, EcommerceOrder order) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("order_id", order.getPlatformOrderNo());
        payload.put("delivery_id", order.getTrackingNo());
        payload.put("waybill_id", order.getTrackingNo());
        payload.put("access_token", config.getExtraField());
        sendPlatformRequest("微信小店", config, payload);
    }

    private void notifyShopify(EcPlatformConfig config, EcommerceOrder order) {
        String shopDomain = config.getExtraField();
        if (!StringUtils.hasText(shopDomain)) {
            log.warn("[物流回调][Shopify] 未配置店铺域名(extraField)");
            return;
        }
        String url = "https://" + shopDomain + "/admin/api/2024-01/orders/"
                + order.getPlatformOrderNo() + "/fulfillments.json";
        Map<String, Object> fulfillment = new LinkedHashMap<>();
        fulfillment.put("tracking_number", order.getTrackingNo());
        fulfillment.put("tracking_company", order.getExpressCompany());
        fulfillment.put("notify_customer", true);
        Map<String, Object> payload = Map.of("fulfillment", fulfillment);
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("X-Shopify-Access-Token", config.getAppSecret());
        headers.put("Content-Type", "application/json");
        try {
            httpClient.postJson(url, payload, Map.class, headers);
            log.info("[物流回调][Shopify] 发货回传成功 orderNo={}", order.getPlatformOrderNo());
        } catch (Exception e) {
            log.warn("[物流回调][Shopify] 回传失败: {}", e.getMessage());
        }
    }

    private void notifyShein(EcPlatformConfig config, EcommerceOrder order) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("orderNo", order.getPlatformOrderNo());
        payload.put("trackingNo", order.getTrackingNo());
        payload.put("expressCompany", order.getExpressCompany());
        payload.put("status", "shipped");
        sendPlatformRequest("希音", config, payload);
    }

    private void notifyJst(EcPlatformConfig config, EcommerceOrder order) {
        String callbackUrl = config.getCallbackUrl();
        if (!StringUtils.hasText(callbackUrl)) {
            callbackUrl = "https://openapi.jushuitan.com/open/logistic/upload";
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("so_id", order.getPlatformOrderNo());
        payload.put("tracking_no", order.getTrackingNo());
        payload.put("express_company", order.getExpressCompany());
        payload.put("status", "shipped");
        try {
            Map<String, String> headers = new LinkedHashMap<>();
            headers.put("Content-Type", "application/json");
            httpClient.postJson(callbackUrl, payload, Map.class, headers);
            log.info("[物流回调][聚水潭] 回传成功 platformOrderNo={}", order.getPlatformOrderNo());
        } catch (Exception e) {
            log.warn("[物流回调][聚水潭] 回传失败: {}", e.getMessage());
        }
    }

    private static final Map<String, String> PLATFORM_API_URLS = Map.of(
            "TAOBAO", "https://eco.taobao.com/router/rest",
            "TMALL", "https://eco.taobao.com/router/rest",
            "JD", "https://api.jd.com/routerjson",
            "PINDUODUO", "https://gw-api.pinduoduo.com/api/router",
            "DOUYIN", "https://openapi-fxg.jinritemai.com/api/trade/v1/ship/mark",
            "XIAOHONGSHU", "https://ark.xiaohongshu.com/api/sns/v1/ec/ship",
            "WECHAT_SHOP", "https://api.weixin.qq.com/shop/ship",
            "SHEIN", "https://open.shein.com/api/shipment/confirm"
    );

    private void sendPlatformRequest(String platformName, EcPlatformConfig config, Map<String, Object> payload) {
        String apiUrl = config.getCallbackUrl();
        if (!StringUtils.hasText(apiUrl)) {
            String defaultUrl = PLATFORM_API_URLS.get(config.getPlatformCode());
            if (StringUtils.hasText(defaultUrl)) {
                apiUrl = defaultUrl;
            }
        }
        if (!StringUtils.hasText(apiUrl)) {
            log.info("[物流回调][{}] 未配置API地址且无默认地址，跳过自动回传。payload={}", platformName, payload);
            return;
        }
        try {
            Map<String, String> headers = new LinkedHashMap<>();
            headers.put("X-App-Key", config.getAppKey());
            httpClient.postJson(apiUrl, payload, Map.class, headers);
            log.info("[物流回调][{}] 回传成功 platformOrderNo={}", platformName, payload.get("platformOrderNo"));
        } catch (Exception e) {
            log.warn("[物流回调][{}] 回传失败: {}", platformName, e.getMessage());
        }
    }

    /**
     * 拉取平台真实库存。
     *
     * <p><b>修订说明</b>：此前该方法直接 {@code return null}，本类另一处
     * updatePlatformStock 更是只打一行日志——等于"库存双向同步"完全是空壳，
     * 调用方（库存差异检测、差异处理）拿着 null 只能跳过或产生假结果。
     * 现改为走 {@link EcPlatformAdapterRegistry} 的真实适配器。
     *
     * @return 平台库存；拉不到返回 -1（调用方据此跳过，不产生假差异）
     */
    public int fetchPlatformStock(Long tenantId, String skuCode) {
        if (tenantId == null || !StringUtils.hasText(skuCode)) {
            return -1;
        }
        if (platformAdapterRegistry == null || ecPlatformConfigService == null) {
            log.debug("[库存同步] 平台适配器未装配，无法拉取库存 skuCode={}", skuCode);
            return -1;
        }
        try {
            for (String platformCode : platformAdapterRegistry.getSupportedPlatforms()) {
                EcPlatformConfig cfg = ecPlatformConfigService.getByTenantAndPlatform(tenantId, platformCode);
                if (cfg == null || !"ACTIVE".equals(cfg.getStatus())) continue;
                if (!StringUtils.hasText(cfg.getAppKey()) || !StringUtils.hasText(cfg.getAppSecret())) continue;

                Optional<EcPlatformAdapter> adapterOpt = platformAdapterRegistry.findAdapter(platformCode);
                if (adapterOpt.isEmpty()) continue;

                EcSyncContext ctx = buildContext(tenantId, platformCode, cfg);
                EcStockPullResult pull = adapterOpt.get().pullStock(ctx, Collections.singletonList(skuCode));
                if (pull != null && pull.getStockMap() != null) {
                    Integer qty = pull.getStockMap().get(skuCode);
                    if (qty != null && qty >= 0) {
                        return qty;
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[库存同步] 拉取平台库存失败 tenantId={} skuCode={} 原因={}",
                    tenantId, skuCode, e.getMessage());
        }
        log.debug("[库存同步] 平台库存不可用 tenantId={} skuCode={} 返回-1", tenantId, skuCode);
        return -1;
    }

    /**
     * 推送本地库存到平台。
     *
     * <p><b>修订说明</b>：此前只打日志什么都不做。现走真实适配器 pushStock，
     * 并把结果如实返回——推送失败时调用方可以感知，而不是以为同步成功了。
     *
     * @return 是否推送成功（无可用平台适配器时返回 false，而非假装成功）
     */
    public boolean updatePlatformStock(Long tenantId, String skuCode, Integer quantity) {
        if (tenantId == null || !StringUtils.hasText(skuCode) || quantity == null) {
            return false;
        }
        if (platformAdapterRegistry == null || ecPlatformConfigService == null) {
            log.info("[库存同步] 平台适配器未装配，库存未推送到平台 skuCode={} qty={}", skuCode, quantity);
            return false;
        }
        try {
            for (String platformCode : platformAdapterRegistry.getSupportedPlatforms()) {
                EcPlatformConfig cfg = ecPlatformConfigService.getByTenantAndPlatform(tenantId, platformCode);
                if (cfg == null || !"ACTIVE".equals(cfg.getStatus())) continue;
                if (!StringUtils.hasText(cfg.getAppKey()) || !StringUtils.hasText(cfg.getAppSecret())) continue;

                Optional<EcPlatformAdapter> adapterOpt = platformAdapterRegistry.findAdapter(platformCode);
                if (adapterOpt.isEmpty()) continue;

                EcStockSyncItem item = EcStockSyncItem.builder()
                        .skuCode(skuCode)
                        .platformSkuId(skuCode)
                        .quantity(quantity)
                        .build();

                EcSyncContext ctx = buildContext(tenantId, platformCode, cfg);
                EcStockSyncResult result = adapterOpt.get().pushStock(ctx, Collections.singletonList(item));
                if (result != null && result.isSuccess()) {
                    log.info("[库存同步] 库存已推送到平台 platform={} skuCode={} qty={}",
                            platformCode, skuCode, quantity);
                    return true;
                }
                log.warn("[库存同步] 平台推送失败 platform={} skuCode={} 原因={}",
                        platformCode, skuCode, result != null ? result.getErrorMessage() : "无响应");
            }
        } catch (Exception e) {
            log.warn("[库存同步] 推送库存到平台失败 tenantId={} skuCode={} 原因={}",
                    tenantId, skuCode, e.getMessage());
        }
        return false;
    }

    /** 依据平台凭证构建同步上下文 */
    private EcSyncContext buildContext(Long tenantId, String platformCode, EcPlatformConfig cfg) {
        return EcSyncContext.builder()
                .tenantId(tenantId)
                .platformCode(platformCode)
                .appId(cfg.getAppKey())
                .appSecret(cfg.getAppSecret())
                .accessToken(cfg.getExtraField())
                .callbackUrl(cfg.getCallbackUrl())
                .build();
    }

    /**
     * 通知平台退款已执行（语义正确：退款回调，而非发货回调）。
     *
     * <p>失败不阻断退款主流程，仅记录告警日志。
     *
     * @param order 已执行退款的电商订单
     */
    public void notifyRefund(EcommerceOrder order) {
        if (order == null) {
            return;
        }
        String platform = order.getSourcePlatformCode();
        if (!StringUtils.hasText(platform)) {
            log.info("[退款回调] 平台为空，跳过 ecOrderNo={}", order.getOrderNo());
            return;
        }
        try {
            EcPlatformConfig config = ecPlatformConfigService.getByTenantAndPlatform(
                    order.getTenantId(), platform);
            if (config == null || !"ACTIVE".equals(config.getStatus())) {
                log.info("[退款回调] 平台={} 未配置凭证或已禁用，跳过自动回传。ecOrderNo={} 需人工处理",
                        platform, order.getOrderNo());
                return;
            }
            if (!StringUtils.hasText(config.getAppKey()) || !StringUtils.hasText(config.getAppSecret())) {
                log.info("[退款回调] 平台={} 凭证不完整(AppKey/AppSecret为空)，跳过自动回传", platform);
                return;
            }
            notifyPlatformRefund(config, order);
        } catch (Exception e) {
            log.warn("[退款回调] 回传失败 平台={} ecOrderNo={} 原因={}",
                    platform, order.getOrderNo(), e.getMessage());
        }
    }

    private void notifyPlatformRefund(EcPlatformConfig config, EcommerceOrder order) {
        String platform = config.getPlatformCode();
        String callbackUrl = config.getCallbackUrl();
        if (StringUtils.hasText(callbackUrl)) {
            notifyRefundViaCallbackUrl(config, order, callbackUrl);
            return;
        }
        switch (platform == null ? "" : platform) {
            case "TAOBAO", "TMALL" -> notifyRefundTaobao(config, order);
            case "JD"              -> notifyRefundJd(config, order);
            case "PINDUODUO"       -> notifyRefundPdd(config, order);
            case "DOUYIN"          -> notifyRefundDouyin(config, order);
            case "WECHAT_SHOP"     -> notifyRefundWechat(config, order);
            case "SHOPIFY"         -> notifyRefundShopify(config, order);
            default -> log.info("[退款回调] 平台={} 暂不支持自动退款回传，ecOrderNo={} 需人工处理",
                    platform, order.getOrderNo());
        }
    }

    private void notifyRefundViaCallbackUrl(EcPlatformConfig config, EcommerceOrder order, String callbackUrl) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("platformOrderNo", order.getPlatformOrderNo());
        payload.put("orderNo", order.getOrderNo());
        payload.put("status", "refunded");
        payload.put("refundReason", order.getSellerRemark());
        payload.put("refundedAt", order.getCompleteTime() != null ? order.getCompleteTime().toString() : null);
        try {
            Map<String, String> headers = new LinkedHashMap<>();
            headers.put("X-App-Key", config.getAppKey());
            headers.put("X-Platform", config.getPlatformCode());
            httpClient.postJson(callbackUrl, payload, Map.class, headers);
            log.info("[退款回调] 通用回调成功 平台={} url={} platformOrderNo={}",
                    config.getPlatformCode(), callbackUrl, order.getPlatformOrderNo());
        } catch (Exception e) {
            log.warn("[退款回调] 通用回调失败 平台={} url={} 原因={}",
                    config.getPlatformCode(), callbackUrl, e.getMessage());
        }
    }

    private void notifyRefundTaobao(EcPlatformConfig config, EcommerceOrder order) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("method", "alipay.trade.refund.notify");
        payload.put("app_key", config.getAppKey());
        payload.put("tid", order.getPlatformOrderNo());
        payload.put("status", "refund_success");
        sendRefundRequest("淘宝/天猫", config, payload);
    }

    private void notifyRefundJd(EcPlatformConfig config, EcommerceOrder order) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("method", "jingdong.order.refund.notify");
        payload.put("app_key", config.getAppKey());
        payload.put("jdOrderId", order.getPlatformOrderNo());
        payload.put("status", "refund_success");
        sendRefundRequest("京东", config, payload);
    }

    private void notifyRefundPdd(EcPlatformConfig config, EcommerceOrder order) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "pdd.refund.notify");
        payload.put("client_id", config.getAppKey());
        payload.put("order_sn", order.getPlatformOrderNo());
        payload.put("refund_status", "success");
        sendRefundRequest("拼多多", config, payload);
    }

    private void notifyRefundDouyin(EcPlatformConfig config, EcommerceOrder order) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("order_id", order.getPlatformOrderNo());
        payload.put("refund_status", "success");
        payload.put("app_id", config.getAppKey());
        payload.put("access_token", config.getExtraField());
        sendRefundRequest("抖音", config, payload);
    }

    private void notifyRefundWechat(EcPlatformConfig config, EcommerceOrder order) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("order_id", order.getPlatformOrderNo());
        payload.put("refund_status", "SUCCESS");
        payload.put("access_token", config.getExtraField());
        sendRefundRequest("微信小店", config, payload);
    }

    private void notifyRefundShopify(EcPlatformConfig config, EcommerceOrder order) {
        String shopDomain = config.getExtraField();
        if (!StringUtils.hasText(shopDomain)) {
            log.warn("[退款回调][Shopify] 未配置店铺域名(extraField)");
            return;
        }
        String url = "https://" + shopDomain + "/admin/api/2024-01/orders/"
                + order.getPlatformOrderNo() + "/cancel.json";
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("reason", "customer_requested");
        payload.put("email", true);
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("X-Shopify-Access-Token", config.getAppSecret());
        headers.put("Content-Type", "application/json");
        try {
            httpClient.postJson(url, payload, Map.class, headers);
            log.info("[退款回调][Shopify] 退款回传成功 orderNo={}", order.getPlatformOrderNo());
        } catch (Exception e) {
            log.warn("[退款回调][Shopify] 回传失败: {}", e.getMessage());
        }
    }

    private void sendRefundRequest(String platformName, EcPlatformConfig config, Map<String, Object> payload) {
        String apiUrl = config.getCallbackUrl();
        if (!StringUtils.hasText(apiUrl)) {
            String defaultUrl = PLATFORM_API_URLS.get(config.getPlatformCode());
            if (StringUtils.hasText(defaultUrl)) {
                apiUrl = defaultUrl;
            }
        }
        if (!StringUtils.hasText(apiUrl)) {
            log.info("[退款回调][{}] 未配置API地址且无默认地址，跳过自动回传。payload={}", platformName, payload);
            return;
        }
        try {
            Map<String, String> headers = new LinkedHashMap<>();
            headers.put("X-App-Key", config.getAppKey());
            httpClient.postJson(apiUrl, payload, Map.class, headers);
            log.info("[退款回调][{}] 回传成功 platformOrderNo={}", platformName, payload.get("platformOrderNo"));
        } catch (Exception e) {
            log.warn("[退款回调][{}] 回传失败: {}", platformName, e.getMessage());
        }
    }
}
