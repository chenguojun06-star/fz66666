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
public class JdPlatformAdapter implements EcPlatformAdapter {

    private static final String API_URL = "https://api.jd.com/routerjson";

    @Autowired
    private IntegrationHttpClient httpClient;

    @Override
    public String getPlatformCode() {
        return "JD";
    }

    @Override
    public boolean testConnection(EcSyncContext ctx) {
        try {
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("method", "jingdong.seller.vender.info.get");
            params.put("app_key", ctx.getAppId());
            Map<String, String> headers = buildHeaders(ctx);
            httpClient.postJson(API_URL, params, Map.class, headers);
            return true;
        } catch (Exception e) {
            log.warn("[京东适配器] 连接测试失败: {}", e.getMessage());
            return false;
        }
    }

    @Override
    public EcProductSyncResult pushProduct(EcSyncContext ctx, StyleInfo style, List<ProductSku> skus) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("method", "jingdong.ware.write.addWare");
            payload.put("app_key", ctx.getAppId());
            payload.put("wareTitle", style.getStyleName());
            payload.put("jdPrice", style.getPrice() != null ? style.getPrice().toPlainString() : "0");
            payload.put("outerId", style.getStyleNo());
            payload.put("stockNum", skus.stream().mapToInt(s -> s.getStockQuantity() != null ? s.getStockQuantity() : 0).sum());
            Map<String, String> headers = buildHeaders(ctx);
            @SuppressWarnings("unchecked")
            Map<String, Object> response = httpClient.postJson(API_URL, payload, Map.class, headers);
            String itemId = response.get("ware_id") != null ? response.get("ware_id").toString() : null;
            return EcProductSyncResult.builder().success(true).platformItemId(itemId).build();
        } catch (Exception e) {
            log.error("[京东适配器] 商品推送失败: {}", e.getMessage());
            return EcProductSyncResult.builder().success(false).errorCode("JD_PUSH_ERROR").errorMessage(e.getMessage()).build();
        }
    }

    @Override
    public EcStockSyncResult pushStock(EcSyncContext ctx, List<EcStockSyncItem> items) {
        int synced = 0, failed = 0;
        for (EcStockSyncItem item : items) {
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("method", "jingdong.ware.stock.update");
                payload.put("app_key", ctx.getAppId());
                payload.put("wareId", item.getPlatformSkuId());
                payload.put("stockNum", item.getQuantity());
                Map<String, String> headers = buildHeaders(ctx);
                httpClient.postJson(API_URL, payload, Map.class, headers);
                synced++;
            } catch (Exception e) {
                failed++;
                log.warn("[京东适配器] 库存同步失败 skuCode={}: {}", item.getSkuCode(), e.getMessage());
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
                payload.put("method", "jingdong.ware.price.update");
                payload.put("app_key", ctx.getAppId());
                payload.put("wareId", item.getPlatformSkuId());
                payload.put("jdPrice", item.getPrice().toPlainString());
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
                payload.put("method", "jingdong.ware.updateWareState");
                payload.put("app_key", ctx.getAppId());
                payload.put("wareId", item.getPlatformSkuId());
                payload.put("operate", "online".equals(item.getAction()) ? "1" : "0");
                Map<String, String> headers = buildHeaders(ctx);
                httpClient.postJson(API_URL, payload, Map.class, headers);
                synced++;
            } catch (Exception e) {
                log.warn("[京东适配器] 状态同步失败: {}", e.getMessage());
            }
        }
        return EcStatusSyncResult.builder().success(true).syncedCount(synced).build();
    }

    @Override
    public EcProductPullResult pullProduct(EcSyncContext ctx, String platformItemId) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("method", "jingdong.ware.search");
            payload.put("app_key", ctx.getAppId());
            payload.put("wareId", platformItemId);
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
        if (ctx.getAppId() != null) headers.put("X-App-Key", ctx.getAppId());
        return headers;
    }
}
