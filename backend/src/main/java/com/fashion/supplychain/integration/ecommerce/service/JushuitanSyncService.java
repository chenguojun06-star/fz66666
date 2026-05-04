package com.fashion.supplychain.integration.ecommerce.service;

import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcommerceOrderOrchestrator;
import com.fashion.supplychain.integration.util.IntegrationHttpClient;
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import com.fashion.supplychain.system.service.EcPlatformConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 聚水潭主动拉取同步服务
 * 定时从聚水潭拉取订单、发现店铺、归集客户数据
 *
 * 聚水潭 OpenAPI 主要接口：
 * - 订单查询: /open/jushuitan/ordersingle/query
 * - 店铺查询: /open/jushuitan/shops/query
 * - 商品查询: /open/jushuitan/products/query
 *
 * API 鉴权方式：HMAC-SHA256(appSecret, timestamp + body)
 */
@Slf4j
@Service
public class JushuitanSyncService {

    private static final String JST_API_BASE = "https://open.jushuitan.com";
    private static final String JST_ORDER_QUERY = "/open/jushuitan/ordersingle/query";
    private static final String JST_SHOP_QUERY = "/open/jushuitan/shops/query";

    @Autowired
    private EcPlatformConfigService ecPlatformConfigService;

    @Autowired
    private EcommerceOrderOrchestrator ecommerceOrderOrchestrator;

    @Autowired
    private IntegrationHttpClient httpClient;

    /**
     * 验证聚水潭连接凭证
     */
    public Map<String, Object> verifyConnection(EcPlatformConfig config) {
        Map<String, Object> result = new LinkedHashMap<>();
        try {
            // 尝试调用店铺查询接口验证凭证
            Map<String, Object> shopResult = fetchShops(config);
            result.put("success", true);
            result.put("message", "连接成功");
            result.put("shops", shopResult.getOrDefault("shops", List.of()));
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", "连接失败: " + e.getMessage());
        }
        return result;
    }

    /**
     * 自动发现聚水潭下的店铺列表
     */
    public Map<String, Object> fetchShops(EcPlatformConfig config) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("page_size", 100);
        Map<String, Object> response = callJstApi(config, JST_SHOP_QUERY, params);

        List<Map<String, Object>> shops = new ArrayList<>();
        if (response != null && response.containsKey("shops")) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> rawShops = (List<Map<String, Object>>) response.get("shops");
            if (rawShops != null) {
                shops = rawShops.stream().map(shop -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("shopId", shop.getOrDefault("shop_id", shop.get("shopId")));
                    m.put("shopName", shop.getOrDefault("shop_name", shop.get("shopName")));
                    m.put("platform", shop.getOrDefault("platform", ""));
                    m.put("status", shop.getOrDefault("status", "active"));
                    return m;
                }).collect(Collectors.toList());
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("shops", shops);
        result.put("total", shops.size());
        return result;
    }

    /**
     * 从聚水潭同步订单（增量拉取）
     * @param config 平台配置
     * @param tenantId 租户ID
     * @param since 拉取此时间之后的订单，不传则拉取最近24小时的
     */
    public Map<String, Object> syncOrders(EcPlatformConfig config, Long tenantId, LocalDateTime since) {
        LocalDateTime startTime = since != null ? since : LocalDateTime.now().minusHours(24);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("modified_begin", startTime.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        params.put("modified_end", LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        params.put("page_size", 50);

        int totalSynced = 0;
        int totalSkipped = 0;
        int page = 1;
        boolean hasMore = true;

        while (hasMore) {
            params.put("page_index", page);
            Map<String, Object> response = callJstApi(config, JST_ORDER_QUERY, params);

            if (response == null || !response.containsKey("orders")) {
                break;
            }

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> orders = (List<Map<String, Object>>) response.get("orders");
            if (orders == null || orders.isEmpty()) {
                break;
            }

            for (Map<String, Object> jstOrder : orders) {
                try {
                    Map<String, Object> body = mapJstOrderToBody(jstOrder);
                    Map<String, Object> result = ecommerceOrderOrchestrator.receiveOrder("JST", body, tenantId);
                    if (Boolean.TRUE.equals(result.get("duplicate"))) {
                        totalSkipped++;
                    } else {
                        totalSynced++;
                    }
                } catch (Exception e) {
                    log.warn("[聚水潭同步] 单笔订单入库失败: {}", e.getMessage());
                    totalSkipped++;
                }
            }

            // 聚水潭返回的总数信息
            Object totalObj = response.getOrDefault("total_count", response.get("total"));
            int totalCount = totalObj instanceof Number ? ((Number) totalObj).intValue() : orders.size();
            if (page * 50 >= totalCount) {
                hasMore = false;
            }
            page++;
        }

        Map<String, Object> syncResult = new LinkedHashMap<>();
        syncResult.put("synced", totalSynced);
        syncResult.put("skipped", totalSkipped);
        syncResult.put("totalPages", page - 1);
        return syncResult;
    }

    /**
     * 聚水潭订单 → 本系统 Webhook body 映射
     *
     * 聚水潭数据结构（两层）:
     *   i_id         = 款式编码（款号），如 "ST001"
     *   sku_id       = 商品编码（聚水潭内部SKU编号）
     *   shop_sku_id  = 线上商品编码（淘宝/京东原始商家编码），通常 = "款号-颜色-尺码"
     *   properties_value = 颜色及规格，如 "黑色;L"
     *   sku_code     = 国际条形码（69码）
     *
     * 映射优先级:
     *   skuCode → shop_sku_id > sku_id（取淘宝原始编码保证格式一致）
     *   款号   → i_id（直接用提款式编码，精准匹配生产单）
     */
    private Map<String, Object> mapJstOrderToBody(Map<String, Object> jstOrder) {
        Map<String, Object> body = new LinkedHashMap<>();
        // 订单号
        body.put("platformOrderNo", jstOrder.getOrDefault("so_id", jstOrder.get("orderNo")));
        // 店铺
        body.put("shopName", jstOrder.getOrDefault("shop_name", jstOrder.get("shopName")));
        // 买家
        body.put("buyerNick", jstOrder.getOrDefault("buyer_nick", jstOrder.get("buyerNick")));
        // 收件人
        body.put("receiverName", jstOrder.getOrDefault("receiver_name", jstOrder.get("receiverName")));
        body.put("receiverPhone", jstOrder.getOrDefault("receiver_phone",
                jstOrder.getOrDefault("receiver_mobile", jstOrder.get("receiverPhone"))));
        body.put("receiverAddress", jstOrder.getOrDefault("receiver_address", jstOrder.get("receiverAddress")));
        body.put("buyerRemark", jstOrder.getOrDefault("buyer_message", jstOrder.get("buyerRemark")));

        // SKU和数量（聚水潭订单可能有多行明细，取第一行）
        Object itemsObj = jstOrder.get("items");
        if (itemsObj instanceof List && !((List<?>) itemsObj).isEmpty()) {
            Object firstItem = ((List<?>) itemsObj).get(0);
            if (firstItem instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> item = (Map<String, Object>) firstItem;
                // skuCode: 优先用 shop_sku_id（淘宝原始商家编码 = 款号-颜色-尺码）
                body.put("skuCode", item.getOrDefault("shop_sku_id",
                        item.getOrDefault("sku_id", item.get("skuCode"))));
                // 款号: 直接用 i_id（聚水潭款式编码）或 styleNo
                body.put("styleNo", item.getOrDefault("i_id",
                        item.getOrDefault("styleNo", jstOrder.get("styleNo"))));
                // 颜色尺码: properties_value 格式 "黑色;L"
                body.put("properties", item.getOrDefault("properties_value", item.get("properties")));
                body.put("quantity", item.getOrDefault("qty", item.get("quantity")));
                body.put("unitPrice", item.getOrDefault("price", item.get("unitPrice")));
                body.put("productName", item.getOrDefault("name", item.get("productName")));
            }
        } else {
            body.put("skuCode", jstOrder.getOrDefault("shop_sku_id",
                    jstOrder.getOrDefault("sku_id", jstOrder.get("skuCode"))));
            body.put("styleNo", jstOrder.getOrDefault("i_id", jstOrder.get("styleNo")));
            body.put("properties", jstOrder.getOrDefault("properties_value", jstOrder.get("properties")));
            body.put("quantity", jstOrder.getOrDefault("qty", jstOrder.get("quantity")));
            body.put("unitPrice", jstOrder.getOrDefault("price", jstOrder.get("unitPrice")));
            body.put("productName", jstOrder.getOrDefault("item_name", jstOrder.get("productName")));
        }

        // 金额
        body.put("totalAmount", jstOrder.getOrDefault("total_amount", jstOrder.get("totalAmount")));
        body.put("payAmount", jstOrder.getOrDefault("pay_amount", jstOrder.get("payAmount")));
        body.put("freight", jstOrder.getOrDefault("freight", 0));
        body.put("discount", jstOrder.getOrDefault("discount", 0));
        body.put("payType", jstOrder.getOrDefault("pay_type", jstOrder.get("payType")));

        return body;
    }

    /**
     * 调用聚水潭 OpenAPI
     */
    private Map<String, Object> callJstApi(EcPlatformConfig config, String path, Map<String, Object> params) {
        try {
            String timestamp = String.valueOf(System.currentTimeMillis() / 1000);
            String bodyJson = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(params);
            String signature = hmacSha256(config.getAppSecret(), timestamp + bodyJson);

            Map<String, String> headers = new LinkedHashMap<>();
            headers.put("Content-Type", "application/json");
            headers.put("X-JST-AppKey", config.getAppKey());
            headers.put("X-JST-Timestamp", timestamp);
            headers.put("X-JST-Signature", signature);

            String url = JST_API_BASE + path;
            @SuppressWarnings("unchecked")
            Map<String, Object> response = httpClient.postJson(url, params, Map.class, headers);
            return response;
        } catch (Exception e) {
            log.error("[聚水潭API] 调用失败 path={}: {}", path, e.getMessage());
            return null;
        }
    }

    private String hmacSha256(String secret, String data) {
        try {
            javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(new javax.crypto.spec.SecretKeySpec(
                    secret.getBytes(java.nio.charset.StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] result = mac.doFinal(data.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : result) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException("HMAC-SHA256 failed", e);
        }
    }
}
