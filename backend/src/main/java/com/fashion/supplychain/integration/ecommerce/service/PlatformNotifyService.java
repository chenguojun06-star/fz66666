package com.fashion.supplychain.integration.ecommerce.service;

import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.util.IntegrationHttpClient;
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import com.fashion.supplychain.system.service.EcPlatformConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Service
public class PlatformNotifyService {

    @Autowired
    private EcPlatformConfigService ecPlatformConfigService;

    @Autowired
    private IntegrationHttpClient httpClient;

    public void notifyShipped(EcommerceOrder order) {
        if (order == null || order.getTrackingNo() == null) {
            log.debug("[物流回调] 快递单号为空，跳过 ecOrderNo={}", order != null ? order.getOrderNo() : null);
            return;
        }
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
}
