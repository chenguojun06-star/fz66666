package com.fashion.supplychain.integration.sync.orchestration;

import com.fashion.supplychain.integration.sync.adapter.EcPlatformAdapter;
import com.fashion.supplychain.integration.sync.adapter.EcPlatformAdapterRegistry;
import com.fashion.supplychain.integration.sync.dto.*;
import com.fashion.supplychain.integration.sync.entity.EcProductMapping;
import com.fashion.supplychain.integration.sync.service.EcProductMappingService;
import com.fashion.supplychain.integration.sync.service.EcStockCalculator;
import com.fashion.supplychain.integration.sync.service.EcSyncConfigService;
import com.fashion.supplychain.integration.sync.service.EcSyncLogService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Component
@Slf4j
public class ProductSyncOrchestrator {

    @Autowired
    private EcPlatformAdapterRegistry adapterRegistry;

    @Autowired
    private EcSyncConfigService syncConfigService;

    @Autowired
    private EcProductMappingService mappingService;

    @Autowired
    private EcSyncLogService syncLogService;

    @Autowired
    private EcStockCalculator stockCalculator;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ProductSkuService productSkuService;

    @Transactional(rollbackFor = Exception.class)
    public void pushStockToPlatform(Long styleId, String platformCode, Long tenantId) {
        EcSyncContext ctx = syncConfigService.buildContext(tenantId, platformCode);
        if (ctx == null) {
            log.warn("[商品同步] 租户{} 平台{} 未配置同步凭证", tenantId, platformCode);
            return;
        }
        EcPlatformAdapter adapter = adapterRegistry.getAdapter(platformCode);
        List<EcProductMapping> mappings = mappingService.listByStyleAndPlatform(styleId, platformCode, tenantId);
        if (mappings.isEmpty()) {
            log.info("[商品同步] 款号{} 平台{} 无SKU映射，跳过库存同步", styleId, platformCode);
            return;
        }
        List<EcStockSyncItem> items = buildStockItems(mappings, tenantId);
        if (items.isEmpty()) {
            return;
        }
        var syncLog = syncLogService.createLog(tenantId, "STOCK_SYNC", platformCode,
                "OUTBOUND", styleId, null, "EVENT");
        long start = System.currentTimeMillis();
        try {
            syncLogService.markSyncing(syncLog.getId());
            EcStockSyncResult result = adapter.pushStock(ctx, items);
            if (result.isSuccess()) {
                syncLogService.markSuccess(syncLog.getId(), null, (int)(System.currentTimeMillis() - start));
                log.info("[商品同步] 库存同步成功 平台={} 款号={} 同步{}条", platformCode, styleId, result.getSyncedCount());
            } else {
                syncLogService.markFailed(syncLog.getId(), "STOCK_SYNC_FAILED", result.getErrorMessage());
                mappings.forEach(m -> mappingService.markFailed(m.getId(), result.getErrorMessage()));
            }
        } catch (Exception e) {
            syncLogService.markFailed(syncLog.getId(), "ADAPTER_ERROR", e.getMessage());
            log.error("[商品同步] 库存同步异常 平台={} 款号={}", platformCode, styleId, e);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void pushPriceToPlatform(Long styleId, String platformCode, Long tenantId) {
        EcSyncContext ctx = syncConfigService.buildContext(tenantId, platformCode);
        if (ctx == null) return;
        EcPlatformAdapter adapter = adapterRegistry.getAdapter(platformCode);
        List<EcProductMapping> mappings = mappingService.listByStyleAndPlatform(styleId, platformCode, tenantId);
        if (mappings.isEmpty()) return;
        List<EcPriceSyncItem> items = buildPriceItems(mappings, tenantId);
        if (items.isEmpty()) return;
        var syncLog = syncLogService.createLog(tenantId, "PRICE_SYNC", platformCode,
                "OUTBOUND", styleId, null, "EVENT");
        long start = System.currentTimeMillis();
        try {
            syncLogService.markSyncing(syncLog.getId());
            EcPriceSyncResult result = adapter.pushPrice(ctx, items);
            if (result.isSuccess()) {
                syncLogService.markSuccess(syncLog.getId(), null, (int)(System.currentTimeMillis() - start));
            } else {
                syncLogService.markFailed(syncLog.getId(), "PRICE_SYNC_FAILED", result.getErrorMessage());
            }
        } catch (Exception e) {
            syncLogService.markFailed(syncLog.getId(), "ADAPTER_ERROR", e.getMessage());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void pushProductToPlatform(Long styleId, String platformCode, Long tenantId) {
        EcSyncContext ctx = syncConfigService.buildContext(tenantId, platformCode);
        if (ctx == null) return;
        EcPlatformAdapter adapter = adapterRegistry.getAdapter(platformCode);
        StyleInfo style = styleInfoService.getById(styleId);
        if (style == null) return;
        List<ProductSku> skus = productSkuService.list(new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<ProductSku>()
                .eq("style_id", styleId)
                .eq("tenant_id", tenantId)
                .eq("status", "ENABLED"));
        var syncLog = syncLogService.createLog(tenantId, "PRODUCT_CREATE", platformCode,
                "OUTBOUND", styleId, null, "MANUAL");
        long start = System.currentTimeMillis();
        try {
            syncLogService.markSyncing(syncLog.getId());
            EcProductSyncResult result = adapter.pushProduct(ctx, style, skus);
            if (result.isSuccess()) {
                syncLogService.markSuccess(syncLog.getId(), null, (int)(System.currentTimeMillis() - start));
                if (result.getPlatformItemId() != null) {
                    for (int i = 0; i < skus.size(); i++) {
                        String platformSkuId = result.getPlatformSkuIds() != null && i < result.getPlatformSkuIds().size()
                                ? result.getPlatformSkuIds().get(i) : null;
                        mappingService.upsertMapping(tenantId, styleId, skus.get(i).getId(),
                                platformCode, result.getPlatformItemId(), platformSkuId);
                    }
                }
            } else {
                syncLogService.markFailed(syncLog.getId(), "PRODUCT_SYNC_FAILED", result.getErrorMessage());
            }
        } catch (Exception e) {
            syncLogService.markFailed(syncLog.getId(), "ADAPTER_ERROR", e.getMessage());
        }
    }

    public void syncAllPlatforms(Long styleId, Long tenantId) {
        List<String> platforms = adapterRegistry.getSupportedPlatforms();
        for (String platform : platforms) {
            try {
                pushStockToPlatform(styleId, platform, tenantId);
            } catch (Exception e) {
                log.warn("[商品同步] 全平台同步失败 平台={} 款号={}", platform, styleId, e);
            }
        }
    }

    private List<EcStockSyncItem> buildStockItems(List<EcProductMapping> mappings, Long tenantId) {
        List<EcStockSyncItem> items = new ArrayList<>();
        for (EcProductMapping m : mappings) {
            if (m.getSkuId() == null || m.getPlatformSkuId() == null) continue;
            int available = stockCalculator.calculateAvailableStock(m.getStyleId(), m.getSkuId());
            ProductSku sku = productSkuService.getById(m.getSkuId());
            items.add(EcStockSyncItem.builder()
                    .skuId(m.getSkuId())
                    .skuCode(sku != null ? sku.getSkuCode() : null)
                    .platformSkuId(m.getPlatformSkuId())
                    .quantity(available)
                    .salesPrice(sku != null ? sku.getSalesPrice() : null)
                    .costPrice(sku != null ? sku.getCostPrice() : null)
                    .build());
        }
        return items;
    }

    private List<EcPriceSyncItem> buildPriceItems(List<EcProductMapping> mappings, Long tenantId) {
        List<EcPriceSyncItem> items = new ArrayList<>();
        for (EcProductMapping m : mappings) {
            if (m.getSkuId() == null || m.getPlatformSkuId() == null) continue;
            ProductSku sku = productSkuService.getById(m.getSkuId());
            if (sku == null || sku.getSalesPrice() == null) continue;
            items.add(EcPriceSyncItem.builder()
                    .skuId(m.getSkuId())
                    .skuCode(sku.getSkuCode())
                    .platformSkuId(m.getPlatformSkuId())
                    .price(sku.getSalesPrice())
                    .build());
        }
        return items;
    }
}
