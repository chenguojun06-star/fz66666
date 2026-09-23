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
 * 京东宙斯（JD routerjson）适配器
 *
 * <p>网关：https://api.jd.com/routerjson，鉴权走 MD5 签名。
 *
 * <p><b>修订说明</b>：本类此前存在三类缺陷，已修复——
 * <ol>
 *   <li>未计算 sign 参数，真实京东网关必拒；现统一走 {@link EcPlatformApiSupport#call}。</li>
 *   <li>不解析响应，HTTP 200 即 {@code synced++}；现按
 *       {@link EcPlatformApiSupport#isSuccess} 逐条判定，失败计入 failed 并回传原因。</li>
 *   <li>{@code pullStock} 曾对所有 SKU 直接返回 -1（等于库存拉取完全不可用）；
 *       现改为真实调用库存查询接口，仅调用失败才标记 -1。</li>
 * </ol>
 */
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
            EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                    EcPlatformApiSupport.METHOD_KEY, "jingdong.seller.vender.info.get", new LinkedHashMap<>());
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
            payload.put("wareTitle", style.getStyleName());
            payload.put("jdPrice", style.getPrice() != null ? style.getPrice().toPlainString() : "0");
            payload.put("outerId", style.getStyleNo());
            payload.put("stockNum", skus.stream().mapToInt(s -> s.getStockQuantity() != null ? s.getStockQuantity() : 0).sum());

            Map<String, Object> resp = EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                    EcPlatformApiSupport.METHOD_KEY, "jingdong.ware.write.addWare", payload);
            String itemId = extractWareId(resp);
            log.info("[京东适配器] 商品推送成功 styleNo={} wareId={}", style.getStyleNo(), itemId);
            return EcProductSyncResult.builder().success(true).platformItemId(itemId).build();
        } catch (Exception e) {
            log.error("[京东适配器] 商品推送失败 styleNo={}: {}", style.getStyleNo(), e.getMessage());
            return EcProductSyncResult.builder()
                    .success(false)
                    .errorCode("JD_PUSH_ERROR")
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
                payload.put("wareId", item.getPlatformSkuId());
                payload.put("stockNum", item.getQuantity() != null ? item.getQuantity() : 0);
                EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                        EcPlatformApiSupport.METHOD_KEY, "jingdong.ware.stock.update", payload);
                synced++;
            } catch (Exception e) {
                failed++;
                lastError = e.getMessage();
                log.warn("[京东适配器] 库存同步失败 skuCode={}: {}", item.getSkuCode(), e.getMessage());
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
                payload.put("wareId", item.getPlatformSkuId());
                payload.put("jdPrice", item.getPrice() != null ? item.getPrice().toPlainString() : "0");
                EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                        EcPlatformApiSupport.METHOD_KEY, "jingdong.ware.price.update", payload);
                synced++;
            } catch (Exception e) {
                failed++;
                lastError = e.getMessage();
                log.warn("[京东适配器] 价格同步失败 skuCode={}: {}", item.getSkuCode(), e.getMessage());
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
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("wareId", item.getPlatformSkuId());
                payload.put("operate", "online".equals(item.getAction()) ? "1" : "0");
                EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                        EcPlatformApiSupport.METHOD_KEY, "jingdong.ware.updateWareState", payload);
                synced++;
            } catch (Exception e) {
                failed++;
                lastError = e.getMessage();
                log.warn("[京东适配器] 状态同步失败: {}", e.getMessage());
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
            payload.put("wareId", platformItemId);
            Map<String, Object> resp = EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                    EcPlatformApiSupport.METHOD_KEY, "jingdong.ware.search", payload);
            return EcProductPullResult.builder().success(true).productData(resp).build();
        } catch (Exception e) {
            return EcProductPullResult.builder().success(false).errorMessage(e.getMessage()).build();
        }
    }

    /**
     * 真实拉取京东库存。
     *
     * <p>此前对所有 SKU 一律返回 -1，等同于"库存拉取不可用"，
     * 差异检测因此永远拿不到平台库存。现按 wareId 逐个查询，
     * 仅调用失败时标记 -1（调用方会跳过该 SKU，不产生假差异）。
     */
    @Override
    public EcStockPullResult pullStock(EcSyncContext ctx, List<String> platformSkuIds) {
        Map<String, Integer> stockMap = new LinkedHashMap<>();
        for (String skuId : platformSkuIds) {
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("wareId", skuId);
                Map<String, Object> resp = EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                        EcPlatformApiSupport.METHOD_KEY, "jingdong.ware.stock.get", payload);
                stockMap.put(skuId, extractStock(resp));
            } catch (Exception e) {
                stockMap.put(skuId, -1);
                log.warn("[京东适配器] 库存拉取失败 wareId={}: {}", skuId, e.getMessage());
            }
        }
        return EcStockPullResult.builder().success(true).stockMap(stockMap).build();
    }

    /** 从库存响应中取数量，兼容 stockNum / stock_num / quantity 多种命名 */
    private int extractStock(Map<String, Object> resp) {
        if (resp == null) return 0;
        for (String key : new String[]{"stockNum", "stock_num", "quantity", "num"}) {
            Object v = resp.get(key);
            if (v instanceof Number) return ((Number) v).intValue();
        }
        return 0;
    }

    private String extractWareId(Map<String, Object> resp) {
        if (resp == null) return null;
        for (String key : new String[]{"ware_id", "wareId"}) {
            Object v = resp.get(key);
            if (v != null) return v.toString();
        }
        return null;
    }
}
