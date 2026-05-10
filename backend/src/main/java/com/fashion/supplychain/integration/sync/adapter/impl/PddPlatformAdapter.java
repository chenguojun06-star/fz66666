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
public class PddPlatformAdapter implements EcPlatformAdapter {

    private static final String API_URL = "https://gw-api.pinduoduo.com/api/router";

    @Autowired
    private IntegrationHttpClient httpClient;

    @Override
    public String getPlatformCode() {
        return "PINDUODUO";
    }

    @Override
    public boolean testConnection(EcSyncContext ctx) {
        try {
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("type", "pdd.goods.list.get");
            params.put("client_id", ctx.getAppId());
            Map<String, String> headers = buildHeaders(ctx);
            httpClient.postJson(API_URL, params, Map.class, headers);
            return true;
        } catch (Exception e) {
            log.warn("[拼多多适配器] 连接测试失败: {}", e.getMessage());
            return false;
        }
    }

    @Override
    public EcProductSyncResult pushProduct(EcSyncContext ctx, StyleInfo style, List<ProductSku> skus) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("type", "pdd.goods.add");
            payload.put("client_id", ctx.getAppId());
            payload.put("goods_name", style.getStyleName());
            payload.put("outer_goods_id", style.getStyleNo());
            payload.put("market_price", style.getPrice() != null ? style.getPrice().toPlainString() : "0");
            List<Map<String, Object>> skuList = new ArrayList<>();
            for (ProductSku sku : skus) {
                Map<String, Object> skuMap = new LinkedHashMap<>();
                skuMap.put("outer_sku_id", sku.getSkuCode());
                skuMap.put("price", sku.getSalesPrice() != null ? sku.getSalesPrice().toPlainString() : "0");
                skuMap.put("quantity", sku.getStockQuantity() != null ? sku.getStockQuantity() : 0);
                skuList.add(skuMap);
            }
            payload.put("sku_list", skuList);
            Map<String, String> headers = buildHeaders(ctx);
            @SuppressWarnings("unchecked")
            Map<String, Object> response = httpClient.postJson(API_URL, payload, Map.class, headers);
            String itemId = response.get("goods_id") != null ? response.get("goods_id").toString() : null;
            return EcProductSyncResult.builder().success(true).platformItemId(itemId).build();
        } catch (Exception e) {
            log.error("[拼多多适配器] 商品推送失败: {}", e.getMessage());
            return EcProductSyncResult.builder().success(false).errorCode("PDD_PUSH_ERROR").errorMessage(e.getMessage()).build();
        }
    }

    @Override
    public EcStockSyncResult pushStock(EcSyncContext ctx, List<EcStockSyncItem> items) {
        int synced = 0, failed = 0;
        for (EcStockSyncItem item : items) {
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("type", "pdd.goods.sku.stock.update");
                payload.put("client_id", ctx.getAppId());
                payload.put("sku_id", item.getPlatformSkuId());
                payload.put("quantity", item.getQuantity());
                Map<String, String> headers = buildHeaders(ctx);
                httpClient.postJson(API_URL, payload, Map.class, headers);
                synced++;
            } catch (Exception e) {
                failed++;
                log.warn("[拼多多适配器] 库存同步失败 skuCode={}: {}", item.getSkuCode(), e.getMessage());
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
                payload.put("type", "pdd.goods.sku.price.update");
                payload.put("client_id", ctx.getAppId());
                payload.put("sku_id", item.getPlatformSkuId());
                payload.put("price", item.getPrice().toPlainString());
                Map<String, String> headers = buildHeaders(ctx);
                httpClient.postJson(API_URL, payload, Map.class, headers);
                synced++;
            } catch (Exception e) {
                failed++;
            }
        }
        return EcPriceSyncResult.builder().success(failed == 0).syncedCount(synced).failedCount(failed).build();
    }

    @Override
    public EcStatusSyncResult pushStatus(EcSyncContext ctx, List<EcStatusSyncItem> items) {
        int synced = 0;
        for (EcStatusSyncItem item : items) {
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("type", "pdd.goods.sale.status.set");
                payload.put("client_id", ctx.getAppId());
                payload.put("goods_id", item.getPlatformSkuId());
                payload.put("is_onsale", "online".equals(item.getAction()) ? 1 : 0);
                Map<String, String> headers = buildHeaders(ctx);
                httpClient.postJson(API_URL, payload, Map.class, headers);
                synced++;
            } catch (Exception e) {
                log.warn("[拼多多适配器] 状态同步失败: {}", e.getMessage());
            }
        }
        return EcStatusSyncResult.builder().success(true).syncedCount(synced).build();
    }

    @Override
    public EcProductPullResult pullProduct(EcSyncContext ctx, String platformItemId) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("type", "pdd.goods.detail.get");
            payload.put("client_id", ctx.getAppId());
            payload.put("goods_id", platformItemId);
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
            stockMap.put(skuId, -1);
        }
        return EcStockPullResult.builder().success(true).stockMap(stockMap).build();
    }

    private Map<String, String> buildHeaders(EcSyncContext ctx) {
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Content-Type", "application/json");
        if (ctx.getAppId() != null) headers.put("X-Client-Key", ctx.getAppId());
        return headers;
    }
}
