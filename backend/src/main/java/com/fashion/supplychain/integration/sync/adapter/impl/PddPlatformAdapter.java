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
 * 拼多多开放平台适配器
 *
 * <p>网关：https://gw-api.pinduoduo.com/api/router，鉴权走 MD5 签名。
 * 拼多多的方法参数名是 {@code type}（淘宝/京东为 {@code method}），
 * 公共参数用 {@code client_id}，故调用时传 {@link EcPlatformApiSupport#TYPE_KEY}。
 *
 * <p><b>修订说明</b>：本类此前的缺陷与淘宝/京东一致（缺签名、HTTP 200 即报成功、
 * pullStock 一律返回 -1），已统一修复——签名与响应校验交给
 * {@link EcPlatformApiSupport}，库存拉取改为真实调用。
 */
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
            Map<String, Object> biz = new LinkedHashMap<>();
            biz.put("page", 1);
            biz.put("page_size", 1);
            EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                    EcPlatformApiSupport.TYPE_KEY, "pdd.goods.list.get", biz);
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

            Map<String, Object> resp = EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                    EcPlatformApiSupport.TYPE_KEY, "pdd.goods.add", payload);
            String goodsId = extractGoodsId(resp);
            log.info("[拼多多适配器] 商品推送成功 styleNo={} goodsId={}", style.getStyleNo(), goodsId);
            return EcProductSyncResult.builder().success(true).platformItemId(goodsId).build();
        } catch (Exception e) {
            log.error("[拼多多适配器] 商品推送失败 styleNo={}: {}", style.getStyleNo(), e.getMessage());
            return EcProductSyncResult.builder()
                    .success(false)
                    .errorCode("PDD_PUSH_ERROR")
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
                payload.put("sku_id", item.getPlatformSkuId());
                payload.put("quantity", item.getQuantity() != null ? item.getQuantity() : 0);
                EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                        EcPlatformApiSupport.TYPE_KEY, "pdd.goods.sku.stock.update", payload);
                synced++;
            } catch (Exception e) {
                failed++;
                lastError = e.getMessage();
                log.warn("[拼多多适配器] 库存同步失败 skuCode={}: {}", item.getSkuCode(), e.getMessage());
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
                payload.put("sku_id", item.getPlatformSkuId());
                payload.put("price", item.getPrice() != null ? item.getPrice().toPlainString() : "0");
                EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                        EcPlatformApiSupport.TYPE_KEY, "pdd.goods.sku.price.update", payload);
                synced++;
            } catch (Exception e) {
                failed++;
                lastError = e.getMessage();
                log.warn("[拼多多适配器] 价格同步失败 skuCode={}: {}", item.getSkuCode(), e.getMessage());
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
                payload.put("goods_id", item.getPlatformSkuId());
                payload.put("is_onsale", "online".equals(item.getAction()) ? 1 : 0);
                EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                        EcPlatformApiSupport.TYPE_KEY, "pdd.goods.sale.status.set", payload);
                synced++;
            } catch (Exception e) {
                failed++;
                lastError = e.getMessage();
                log.warn("[拼多多适配器] 状态同步失败: {}", e.getMessage());
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
            payload.put("goods_id", platformItemId);
            Map<String, Object> resp = EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                    EcPlatformApiSupport.TYPE_KEY, "pdd.goods.detail.get", payload);
            return EcProductPullResult.builder().success(true).productData(resp).build();
        } catch (Exception e) {
            return EcProductPullResult.builder().success(false).errorMessage(e.getMessage()).build();
        }
    }

    /**
     * 真实拉取拼多多库存。
     *
     * <p>此前对所有 SKU 一律返回 -1（库存拉取不可用），现改为按 sku_id 查询，
     * 仅调用失败时标记 -1，避免调用方把"拉不到"误判成"平台没库存"。
     */
    @Override
    public EcStockPullResult pullStock(EcSyncContext ctx, List<String> platformSkuIds) {
        Map<String, Integer> stockMap = new LinkedHashMap<>();
        for (String skuId : platformSkuIds) {
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("sku_id", skuId);
                Map<String, Object> resp = EcPlatformApiSupport.call(httpClient, API_URL, ctx,
                        EcPlatformApiSupport.TYPE_KEY, "pdd.goods.sku.stock.get", payload);
                stockMap.put(skuId, extractStock(resp));
            } catch (Exception e) {
                stockMap.put(skuId, -1);
                log.warn("[拼多多适配器] 库存拉取失败 skuId={}: {}", skuId, e.getMessage());
            }
        }
        return EcStockPullResult.builder().success(true).stockMap(stockMap).build();
    }

    /** 从库存响应中取数量，兼容 quantity / stock / stock_num 多种命名 */
    private int extractStock(Map<String, Object> resp) {
        if (resp == null) return 0;
        for (String key : new String[]{"quantity", "stock", "stock_num", "num"}) {
            Object v = resp.get(key);
            if (v instanceof Number) return ((Number) v).intValue();
        }
        return 0;
    }

    private String extractGoodsId(Map<String, Object> resp) {
        if (resp == null) return null;
        for (String key : new String[]{"goods_id", "goodsId"}) {
            Object v = resp.get(key);
            if (v != null) return v.toString();
        }
        return null;
    }
}
