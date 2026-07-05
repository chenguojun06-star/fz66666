package com.fashion.supplychain.integration.sync.adapter.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.integration.sync.adapter.EcPlatformAdapter;
import com.fashion.supplychain.integration.sync.dto.*;
import com.fashion.supplychain.integration.util.IntegrationHttpClient;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 聚水潭（JST）平台适配器
 *
 * 实现商品/库存/价格/上下架状态的推送与拉取，复用聚水潭 OpenAPI。
 * 订单同步走 JushuitanSyncService（独立流程，因为订单是 pull 模式）。
 *
 * 聚水潭 OpenAPI 主要接口：
 *   - 商品上传：/open/products/upload
 *   - 库存更新：/open/inventory/upload
 *   - 价格更新：/open/price/upload
 *   - 上下架：  /open/product/status/update
 *   - 商品查询：/open/products/query
 *   - 库存查询：/open/inventory/query
 *
 * 鉴权：HMAC-SHA256(appSecret, timestamp + body)
 */
@Component
@Slf4j
public class JushuitanPlatformAdapter implements EcPlatformAdapter {

    private static final String JST_API_BASE = "https://openapi.jushuitan.com";
    private static final String JST_PRODUCT_UPLOAD = "/open/products/upload";
    private static final String JST_INVENTORY_UPLOAD = "/open/inventory/upload";
    private static final String JST_PRICE_UPLOAD = "/open/price/upload";
    private static final String JST_STATUS_UPDATE = "/open/product/status/update";
    private static final String JST_PRODUCT_QUERY = "/open/products/query";
    private static final String JST_INVENTORY_QUERY = "/open/inventory/query";

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    private IntegrationHttpClient httpClient;

    @Override
    public String getPlatformCode() {
        return "JST";
    }

    @Override
    public boolean testConnection(EcSyncContext ctx) {
        try {
            // 调用商品查询接口（空查询）验证凭证
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("page_size", 1);
            params.put("page_index", 1);
            Map<String, Object> resp = callJstApi(ctx, JST_PRODUCT_QUERY, params);
            return resp != null;
        } catch (Exception e) {
            log.warn("[聚水潭适配器] 连接测试失败: {}", e.getMessage());
            return false;
        }
    }

    // ============================================================
    // 商品推送：把本系统款式+SKU 推送到聚水潭
    // ============================================================
    @Override
    public EcProductSyncResult pushProduct(EcSyncContext ctx, StyleInfo style, List<ProductSku> skus) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            // 聚水潭商品 i_id = 款号
            payload.put("i_id", style.getStyleNo());
            payload.put("name", style.getStyleName());
            payload.put("outer_id", style.getStyleNo());
            if (style.getCover() != null) {
                payload.put("pic", style.getCover());
            }
            if (style.getDescription() != null) {
                payload.put("description", style.getDescription());
            }
            // SKU 明细
            List<Map<String, Object>> skuItems = new ArrayList<>();
            for (ProductSku sku : skus) {
                Map<String, Object> skuItem = new LinkedHashMap<>();
                skuItem.put("sku_id", sku.getSkuCode());
                skuItem.put("shop_sku_id", sku.getSkuCode());
                skuItem.put("properties_value", buildPropertiesValue(sku));
                if (sku.getSalesPrice() != null) {
                    skuItem.put("price", sku.getSalesPrice().toPlainString());
                } else if (style.getPrice() != null) {
                    skuItem.put("price", style.getPrice().toPlainString());
                }
                skuItem.put("qty", sku.getStockQuantity() != null ? sku.getStockQuantity() : 0);
                skuItems.add(skuItem);
            }
            payload.put("skus", skuItems);

            Map<String, Object> resp = callJstApi(ctx, JST_PRODUCT_UPLOAD, payload);
            String platformItemId = extractString(resp, "i_id");
            List<String> platformSkuIds = new ArrayList<>();
            for (ProductSku sku : skus) {
                platformSkuIds.add(sku.getSkuCode());
            }
            log.info("[聚水潭适配器] 商品推送成功 styleNo={} skuCount={}", style.getStyleNo(), skus.size());
            return EcProductSyncResult.builder()
                    .success(true)
                    .platformItemId(platformItemId)
                    .platformSkuIds(platformSkuIds)
                    .build();
        } catch (Exception e) {
            log.error("[聚水潭适配器] 商品推送失败 styleNo={}: {}", style.getStyleNo(), e.getMessage());
            return EcProductSyncResult.builder()
                    .success(false)
                    .errorCode("JST_PUSH_PRODUCT_ERROR")
                    .errorMessage(e.getMessage())
                    .build();
        }
    }

    // ============================================================
    // 库存推送：批量更新聚水潭库存
    // ============================================================
    @Override
    public EcStockSyncResult pushStock(EcSyncContext ctx, List<EcStockSyncItem> items) {
        int synced = 0, failed = 0;
        // 聚水潭库存接口支持批量，每批不超过 50 条
        int batchSize = 50;
        for (int i = 0; i < items.size(); i += batchSize) {
            int end = Math.min(i + batchSize, items.size());
            List<EcStockSyncItem> batch = items.subList(i, end);
            try {
                List<Map<String, Object>> skuList = new ArrayList<>();
                for (EcStockSyncItem item : batch) {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("sku_id", item.getPlatformSkuId());
                    m.put("qty", item.getQuantity() != null ? item.getQuantity() : 0);
                    skuList.add(m);
                }
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("items", skuList);
                callJstApi(ctx, JST_INVENTORY_UPLOAD, payload);
                synced += batch.size();
            } catch (Exception e) {
                failed += batch.size();
                log.warn("[聚水潭适配器] 库存批量同步失败 batch={}: {}", i, e.getMessage());
            }
        }
        return EcStockSyncResult.builder()
                .success(failed == 0)
                .syncedCount(synced)
                .failedCount(failed)
                .build();
    }

    // ============================================================
    // 价格推送：批量更新聚水潭价格
    // ============================================================
    @Override
    public EcPriceSyncResult pushPrice(EcSyncContext ctx, List<EcPriceSyncItem> items) {
        int synced = 0, failed = 0;
        for (EcPriceSyncItem item : items) {
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("sku_id", item.getPlatformSkuId());
                payload.put("price", item.getPrice() != null ? item.getPrice().toPlainString() : "0");
                if (item.getOriginalPrice() != null) {
                    payload.put("original_price", item.getOriginalPrice().toPlainString());
                }
                callJstApi(ctx, JST_PRICE_UPLOAD, payload);
                synced++;
            } catch (Exception e) {
                failed++;
                log.warn("[聚水潭适配器] 价格同步失败 skuCode={}: {}", item.getSkuCode(), e.getMessage());
            }
        }
        return EcPriceSyncResult.builder()
                .success(failed == 0)
                .syncedCount(synced)
                .failedCount(failed)
                .build();
    }

    // ============================================================
    // 状态推送：上下架
    // ============================================================
    @Override
    public EcStatusSyncResult pushStatus(EcSyncContext ctx, List<EcStatusSyncItem> items) {
        int synced = 0, failed = 0;
        for (EcStatusSyncItem item : items) {
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("i_id", item.getPlatformSkuId());
                // 聚水潭：1=上架 0=下架
                String action = item.getAction();
                int status = "online".equals(action) ? 1 : 0;
                payload.put("status", status);
                callJstApi(ctx, JST_STATUS_UPDATE, payload);
                synced++;
            } catch (Exception e) {
                failed++;
                log.warn("[聚水潭适配器] 状态同步失败 skuCode={}: {}", item.getSkuCode(), e.getMessage());
            }
        }
        return EcStatusSyncResult.builder()
                .success(failed == 0)
                .syncedCount(synced)
                .errorMessage(failed > 0 ? failed + " 条失败" : null)
                .build();
    }

    // ============================================================
    // 商品查询
    // ============================================================
    @Override
    public EcProductPullResult pullProduct(EcSyncContext ctx, String platformItemId) {
        try {
            Map<String, Object> params = new LinkedHashMap<>();
            params.put("i_id", platformItemId);
            Map<String, Object> resp = callJstApi(ctx, JST_PRODUCT_QUERY, params);
            return EcProductPullResult.builder()
                    .success(true)
                    .productData(resp)
                    .build();
        } catch (Exception e) {
            return EcProductPullResult.builder()
                    .success(false)
                    .errorMessage(e.getMessage())
                    .build();
        }
    }

    // ============================================================
    // 库存查询
    // ============================================================
    @Override
    public EcStockPullResult pullStock(EcSyncContext ctx, List<String> platformSkuIds) {
        Map<String, Integer> stockMap = new LinkedHashMap<>();
        int batchSize = 50;
        for (int i = 0; i < platformSkuIds.size(); i += batchSize) {
            int end = Math.min(i + batchSize, platformSkuIds.size());
            List<String> batch = platformSkuIds.subList(i, end);
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("sku_ids", batch);
                Map<String, Object> resp = callJstApi(ctx, JST_INVENTORY_QUERY, payload);
                if (resp != null && resp.containsKey("items")) {
                    Object itemsObj = resp.get("items");
                    if (itemsObj instanceof List) {
                        for (Object o : (List<?>) itemsObj) {
                            if (o instanceof Map) {
                                @SuppressWarnings("unchecked")
                                Map<String, Object> m = (Map<String, Object>) o;
                                String skuId = String.valueOf(m.getOrDefault("sku_id", ""));
                                Object qty = m.get("qty");
                                int qtyInt = qty instanceof Number ? ((Number) qty).intValue() : 0;
                                stockMap.put(skuId, qtyInt);
                            }
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("[聚水潭适配器] 库存查询失败 batch={}: {}", i, e.getMessage());
                for (String skuId : batch) {
                    stockMap.put(skuId, -1);
                }
            }
        }
        return EcStockPullResult.builder()
                .success(true)
                .stockMap(stockMap)
                .build();
    }

    // ============================================================
    // 内部工具
    // ============================================================

    /**
     * 调用聚水潭 OpenAPI（HMAC-SHA256 签名）
     */
    private Map<String, Object> callJstApi(EcSyncContext ctx, String path, Map<String, Object> params) {
        try {
            String timestamp = String.valueOf(System.currentTimeMillis() / 1000);
            String bodyJson = MAPPER.writeValueAsString(params);
            String signature = hmacSha256(ctx.getAppSecret(), timestamp + bodyJson);

            Map<String, String> headers = new LinkedHashMap<>();
            headers.put("Content-Type", "application/json");
            headers.put("X-JST-AppKey", ctx.getAppId());
            headers.put("X-JST-Timestamp", timestamp);
            headers.put("X-JST-Signature", signature);

            String url = JST_API_BASE + path;
            @SuppressWarnings("unchecked")
            Map<String, Object> response = httpClient.postJson(url, params, Map.class, headers);
            return response;
        } catch (Exception e) {
            log.error("[聚水潭API] 调用失败 path={}: {}", path, e.getMessage());
            throw new RuntimeException("聚水潭API调用失败: " + path, e);
        }
    }

    private String hmacSha256(String secret, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] result = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : result) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException("HMAC-SHA256 failed", e);
        }
    }

    private String buildPropertiesValue(ProductSku sku) {
        StringBuilder sb = new StringBuilder();
        if (sku.getColor() != null) {
            sb.append(sku.getColor());
        }
        if (sku.getSize() != null) {
            if (sb.length() > 0) sb.append(";");
            sb.append(sku.getSize());
        }
        return sb.toString();
    }

    private String extractString(Map<String, Object> map, String key) {
        if (map == null) return null;
        Object v = map.get(key);
        return v != null ? v.toString() : null;
    }
}
