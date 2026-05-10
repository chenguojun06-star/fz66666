package com.fashion.supplychain.integration.sync.adapter;

import com.fashion.supplychain.integration.sync.dto.*;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import java.util.List;

public interface EcPlatformAdapter {
    String getPlatformCode();
    boolean testConnection(EcSyncContext ctx);
    EcProductSyncResult pushProduct(EcSyncContext ctx, StyleInfo style, List<ProductSku> skus);
    EcStockSyncResult pushStock(EcSyncContext ctx, List<EcStockSyncItem> items);
    EcPriceSyncResult pushPrice(EcSyncContext ctx, List<EcPriceSyncItem> items);
    EcStatusSyncResult pushStatus(EcSyncContext ctx, List<EcStatusSyncItem> items);
    EcProductPullResult pullProduct(EcSyncContext ctx, String platformItemId);
    EcStockPullResult pullStock(EcSyncContext ctx, List<String> platformSkuIds);
}
