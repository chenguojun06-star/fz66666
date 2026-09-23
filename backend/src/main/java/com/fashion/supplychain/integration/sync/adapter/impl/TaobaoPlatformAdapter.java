package com.fashion.supplychain.integration.sync.adapter.impl;

import com.fashion.supplychain.integration.sync.adapter.EcPlatformAdapter;
import com.fashion.supplychain.integration.sync.adapter.EcPlatformApiSupport;
import com.fashion.supplychain.integration.sync.dto.*;
import com.fashion.supplychain.integration.util.IntegrationHttpClient;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * 淘宝开放平台（TOP）适配器
 *
 * <p>网关：https://eco.taobao.com/router/rest，鉴权走 MD5 签名。
 *
 * <p><b>修订说明</b>：本类此前存在三类缺陷，已修复——
 * <ol>
 *   <li>未计算 sign 参数，真实 TOP 网关必拒；
 *      现统一走 {@link EcPlatformApiSupport#call} 自动签名。</li>
 *   <li>不解析响应，HTTP 200 即 {@code synced++}，平台返回 error_response 时报成功；
 *      现每条都按 {@link EcPlatformApiSupport#isSuccess} 判定，失败计入 failed。</li>
 *   <li>extractSkuIds 曾返回"按入参数量填充 null 的占位列表"，会把 null 当作平台
 *      商品ID 写回系统，导致后续库存/价格推送拿不到有效ID；改为真实提取。</li>
 * </ol>
 *
 * <p>注意：淘宝部分写接口要求 session（用户授权令牌），需在
 * {@link EcSyncContext#getAccessToken} 中传入。缺少时平台返回错误，
 * 现已能被正确识别为失败并回传原因，不再静默报成功。
 */
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
            Map<String, Object> biz = new LinkedHashMap<>();
            biz.put("fields", "sid,cid,title");
            EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                    EcPlatformApiSupport.METHOD_KEY, "taobao.shop.get", biz);
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
            payload.put("num", skus.stream().mapToInt(s -> s.getStockQuantity() != null ? s.getStockQuantity() : 0).sum());
            payload.put("title", style.getStyleName());
            payload.put("desc", style.getDescription());
            payload.put("price", style.getPrice() != null ? style.getPrice().toPlainString() : "0");
            if (style.getCover() != null) {
                payload.put("main_pic", style.getCover());
            }
            payload.put("outer_id", style.getStyleNo());
            payload.put("type", "fixed");

            Map<String, Object> resp = EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                    EcPlatformApiSupport.METHOD_KEY, "taobao.item.add", payload);
            String itemId = extractItemId(resp);
            List<String> skuIds = extractSkuIds(resp);
            log.info("[淘宝适配器] 商品推送成功 styleNo={} itemId={} skuCount={}",
                    style.getStyleNo(), itemId, skuIds.size());
            return EcProductSyncResult.builder()
                    .success(true)
                    .platformItemId(itemId)
                    .platformSkuIds(skuIds)
                    .build();
        } catch (Exception e) {
            log.error("[淘宝适配器] 商品推送失败 styleNo={}: {}", style.getStyleNo(), e.getMessage());
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
        String lastError = null;
        for (EcStockSyncItem item : items) {
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("num_iid", item.getPlatformSkuId());
                payload.put("quantity", item.getQuantity() != null ? item.getQuantity() : 0);
                if (item.getPlatformSkuId() != null) {
                    payload.put("sku_id", item.getPlatformSkuId());
                }
                EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                        EcPlatformApiSupport.METHOD_KEY, "taobao.item.quantity.update", payload);
                synced++;
            } catch (Exception e) {
                failed++;
                lastError = e.getMessage();
                log.warn("[淘宝适配器] 库存同步失败 skuCode={}: {}", item.getSkuCode(), e.getMessage());
            }
        }
        return EcStockSyncResult.builder()
                .success(failed == 0)
                .syncedCount(synced)
                .failedCount(failed)
                .errorMessage(failed > 0 ? lastError : null)
                .build();
    }

    @Override
    public EcPriceSyncResult pushPrice(EcSyncContext ctx, List<EcPriceSyncItem> items) {
        int synced = 0, failed = 0;
        String lastError = null;
        for (EcPriceSyncItem item : items) {
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("num_iid", item.getPlatformSkuId());
                payload.put("sku_id", item.getPlatformSkuId());
                payload.put("price", item.getPrice() != null ? item.getPrice().toPlainString() : "0");
                EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                        EcPlatformApiSupport.METHOD_KEY, "taobao.item.price.update", payload);
                synced++;
            } catch (Exception e) {
                failed++;
                lastError = e.getMessage();
                log.warn("[淘宝适配器] 价格同步失败 skuCode={}: {}", item.getSkuCode(), e.getMessage());
            }
        }
        return EcPriceSyncResult.builder()
                .success(failed == 0)
                .syncedCount(synced)
                .failedCount(failed)
                .errorMessage(failed > 0 ? lastError : null)
                .build();
    }

    @Override
    public EcStatusSyncResult pushStatus(EcSyncContext ctx, List<EcStatusSyncItem> items) {
        int synced = 0, failed = 0;
        String lastError = null;
        for (EcStatusSyncItem item : items) {
            try {
                String method = "online".equals(item.getAction())
                        ? "taobao.item.update.listing" : "taobao.item.update.delisting";
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("num_iid", item.getPlatformSkuId());
                EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                        EcPlatformApiSupport.METHOD_KEY, method, payload);
                synced++;
            } catch (Exception e) {
                failed++;
                lastError = e.getMessage();
                log.warn("[淘宝适配器] 状态同步失败: {}", e.getMessage());
            }
        }
        return EcStatusSyncResult.builder()
                .success(failed == 0)
                .syncedCount(synced)
                .errorMessage(failed > 0 ? lastError : null)
                .build();
    }

    @Override
    public EcProductPullResult pullProduct(EcSyncContext ctx, String platformItemId) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("num_iid", platformItemId);
            payload.put("fields", "num_iid,title,price,num,sku");
            Map<String, Object> resp = EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                    EcPlatformApiSupport.METHOD_KEY, "taobao.item.seller.get", payload);
            return EcProductPullResult.builder().success(true).productData(resp).build();
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
                payload.put("num_iid", skuId);
                payload.put("fields", "num,sku");
                Map<String, Object> resp = EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                        EcPlatformApiSupport.METHOD_KEY, "taobao.item.seller.get", payload);
                stockMap.put(skuId, extractQuantity(resp));
            } catch (Exception e) {
                // -1 = 该SKU拉取失败，调用方（差异检测）会跳过，避免产生假差异
                stockMap.put(skuId, -1);
                log.warn("[淘宝适配器] 库存拉取失败 platformSkuId={}: {}", skuId, e.getMessage());
            }
        }
        return EcStockPullResult.builder().success(true).stockMap(stockMap).build();
    }

    /** 从商品详情响应中取库存数量，取不到返回 0 */
    private int extractQuantity(Map<String, Object> resp) {
        if (resp == null) return 0;
        Map<String, Object> target = resp;
        Object item = resp.get("item");
        if (item instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> itemMap = (Map<String, Object>) item;
            target = itemMap;
        }
        Object qty = target.get("num");
        if (qty == null) qty = target.get("quantity");
        return qty instanceof Number ? ((Number) qty).intValue() : 0;
    }

    private String extractItemId(Map<String, Object> response) {
        if (response == null) return null;
        Map<String, Object> target = response;
        Object item = response.get("item");
        if (item instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> itemMap = (Map<String, Object>) item;
            target = itemMap;
        }
        Object id = target.get("num_iid");
        if (id == null) id = target.get("item_id");
        return id != null ? id.toString() : null;
    }

    /**
     * 从响应中真实提取平台 SKU ID 列表。
     *
     * <p>曾返回"按入参数量填充 null 的占位列表"，会把 null 当平台商品ID 写回系统。
     * 改为真实提取；平台未返回 SKU 结构时返回空列表（由调用方按无 SKU 处理）。
     */
    private List<String> extractSkuIds(Map<String, Object> response) {
        List<String> skuIds = new ArrayList<>();
        if (response == null) return skuIds;
        Object item = response.get("item");
        if (!(item instanceof Map)) return skuIds;
        @SuppressWarnings("unchecked")
        Map<String, Object> itemMap = (Map<String, Object>) item;
        Object skus = itemMap.get("skus");
        if (skus instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> skusMap = (Map<String, Object>) skus;
            Object list = skusMap.get("sku");
            if (list instanceof List) {
                for (Object o : (List<?>) list) {
                    if (o instanceof Map) {
                        Object id = ((Map<?, ?>) o).get("sku_id");
                        if (id != null) skuIds.add(id.toString());
                    }
                }
            }
        }
        return skuIds;
    }
}
