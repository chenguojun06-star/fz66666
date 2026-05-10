package com.fashion.supplychain.integration.sync.adapter.impl;

import com.fashion.supplychain.integration.sync.adapter.EcPlatformAdapter;
import com.fashion.supplychain.integration.sync.dto.*;
import com.fashion.supplychain.integration.util.IntegrationHttpClient;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

@Component
@Slf4j
public class TaobaoPlatformAdapter implements EcPlatformAdapter {

    private static final String API_URL = "https://eco.taobao.com/router/rest";

    @Autowired
    private IntegrationHttpClient httpClient;

    @Override
    public String getPlatformCode() {
        return "TAOBAO";
    }

    @Override
    public boolean testConnection(EcSyncContext ctx) {
        try {
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("method", "taobao.shop.get");
            params.put("app_key", ctx.getAppId());
            params.put("timestamp", java.time.LocalDateTime.now().toString());
            params.put("sign_method", "hmac");
            Map<String, String> headers = buildHeaders(ctx);
            httpClient.postJson(API_URL, params, Map.class, headers);
            return true;
        } catch (Exception e) {
            log.warn("[淘宝适配器] 连接测试失败: {}", e.getMessage());
            return false;
        }
    }

    @Override
    public EcProductSyncResult pushProduct(EcSyncContext ctx, StyleInfo style, List<ProductSku> skus) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("method", "taobao.item.add");
            payload.put("app_key", ctx.getAppId());
            payload.put("num", skus.stream().mapToInt(s -> s.getStockQuantity() != null ? s.getStockQuantity() : 0).sum());
            payload.put("title", style.getStyleName());
            payload.put("desc", style.getDescription());
            payload.put("price", style.getPrice() != null ? style.getPrice().toPlainString() : "0");
            if (style.getCover() != null) {
                payload.put("main_pic", style.getCover());
            }
            payload.put("outer_id", style.getStyleNo());
            payload.put("type", "fixed");
            Map<String, String> headers = buildHeaders(ctx);
            @SuppressWarnings("unchecked")
            Map<String, Object> response = httpClient.postJson(API_URL, payload, Map.class, headers);
            String itemId = extractItemId(response);
            List<String> skuIds = extractSkuIds(response, skus);
            return EcProductSyncResult.builder()
                    .success(true)
                    .platformItemId(itemId)
                    .platformSkuIds(skuIds)
                    .build();
        } catch (Exception e) {
            log.error("[淘宝适配器] 商品推送失败: {}", e.getMessage());
            return EcProductSyncResult.builder()
                    .success(false)
                    .errorCode("TAOBAO_PUSH_ERROR")
                    .errorMessage(e.getMessage())
                    .build();
        }
    }

    @Override
    public EcStockSyncResult pushStock(EcSyncContext ctx, List<EcStockSyncItem> items) {
        int synced = 0, failed = 0;
        for (EcStockSyncItem item : items) {
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("method", "taobao.item.quantity.update");
                payload.put("app_key", ctx.getAppId());
                payload.put("num_iid", item.getPlatformSkuId());
                payload.put("quantity", item.getQuantity());
                payload.put("sku_id", item.getPlatformSkuId());
                Map<String, String> headers = buildHeaders(ctx);
                httpClient.postJson(API_URL, payload, Map.class, headers);
                synced++;
            } catch (Exception e) {
                failed++;
                log.warn("[淘宝适配器] 库存同步失败 skuCode={}: {}", item.getSkuCode(), e.getMessage());
            }
        }
        return EcStockSyncResult.builder().success(failed == 0).syncedCount(synced).failedCount(failed).build();
    }

    @Override
    public EcPriceSyncResult pushPrice(EcSyncContext ctx, List<EcPriceSyncItem> items) {
        int synced = 0, failed = 0;
        for (EcPriceSyncItem item : items) {
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("method", "taobao.item.price.update");
                payload.put("app_key", ctx.getAppId());
                payload.put("sku_id", item.getPlatformSkuId());
                payload.put("price", item.getPrice().toPlainString());
                Map<String, String> headers = buildHeaders(ctx);
                httpClient.postJson(API_URL, payload, Map.class, headers);
                synced++;
            } catch (Exception e) {
                failed++;
                log.warn("[淘宝适配器] 价格同步失败 skuCode={}: {}", item.getSkuCode(), e.getMessage());
            }
        }
        return EcPriceSyncResult.builder().success(failed == 0).syncedCount(synced).failedCount(failed).build();
    }

    @Override
    public EcStatusSyncResult pushStatus(EcSyncContext ctx, List<EcStatusSyncItem> items) {
        int synced = 0;
        for (EcStatusSyncItem item : items) {
            try {
                String method = "online".equals(item.getAction())
                        ? "taobao.item.update.listing" : "taobao.item.update.delisting";
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("method", method);
                payload.put("app_key", ctx.getAppId());
                payload.put("num_iid", item.getPlatformSkuId());
                Map<String, String> headers = buildHeaders(ctx);
                httpClient.postJson(API_URL, payload, Map.class, headers);
                synced++;
            } catch (Exception e) {
                log.warn("[淘宝适配器] 状态同步失败: {}", e.getMessage());
            }
        }
        return EcStatusSyncResult.builder().success(true).syncedCount(synced).build();
    }

    @Override
    public EcProductPullResult pullProduct(EcSyncContext ctx, String platformItemId) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("method", "taobao.item.seller.get");
            payload.put("app_key", ctx.getAppId());
            payload.put("num_iid", platformItemId);
            Map<String, String> headers = buildHeaders(ctx);
            @SuppressWarnings("unchecked")
            Map<String, Object> response = httpClient.postJson(API_URL, payload, Map.class, headers);
            return EcProductPullResult.builder().success(true).productData(response).build();
        } catch (Exception e) {
            return EcProductPullResult.builder().success(false).errorMessage(e.getMessage()).build();
        }
    }

    @Override
    public EcStockPullResult pullStock(EcSyncContext ctx, List<String> platformSkuIds) {
        Map<String, Integer> stockMap = new LinkedHashMap<>();
        for (String skuId : platformSkuIds) {
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("method", "taobao.item.seller.get");
                payload.put("app_key", ctx.getAppId());
                payload.put("num_iid", skuId);
                payload.put("fields", "quantity");
                Map<String, String> headers = buildHeaders(ctx);
                @SuppressWarnings("unchecked")
                Map<String, Object> response = httpClient.postJson(API_URL, payload, Map.class, headers);
                Object qty = response.get("quantity");
                stockMap.put(skuId, qty instanceof Number ? ((Number) qty).intValue() : 0);
            } catch (Exception e) {
                stockMap.put(skuId, -1);
            }
        }
        return EcStockPullResult.builder().success(true).stockMap(stockMap).build();
    }

    private Map<String, String> buildHeaders(EcSyncContext ctx) {
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Content-Type", "application/json");
        if (ctx.getAppId() != null) headers.put("X-App-Key", ctx.getAppId());
        if (ctx.getAppSecret() != null) headers.put("X-App-Secret", ctx.getAppSecret());
        return headers;
    }

    private String extractItemId(Map<String, Object> response) {
        if (response == null) return null;
        Object item = response.get("item");
        if (item instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> itemMap = (Map<String, Object>) item;
            Object id = itemMap.get("item_id");
            return id != null ? id.toString() : null;
        }
        Object id = response.get("item_id");
        return id != null ? id.toString() : null;
    }

    private List<String> extractSkuIds(Map<String, Object> response, List<ProductSku> skus) {
        List<String> skuIds = new ArrayList<>();
        for (int i = 0; i < skus.size(); i++) {
            skuIds.add(null);
        }
        return skuIds;
    }
}
