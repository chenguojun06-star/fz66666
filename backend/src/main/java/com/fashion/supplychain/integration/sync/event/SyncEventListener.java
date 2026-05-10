package com.fashion.supplychain.integration.sync.event;

import com.fashion.supplychain.integration.sync.orchestration.ProductSyncOrchestrator;
import com.fashion.supplychain.integration.sync.service.EcProductMappingService;
import com.fashion.supplychain.integration.sync.service.EcSyncConfigService;
import com.fashion.supplychain.integration.sync.entity.EcSyncConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@Slf4j
public class SyncEventListener {

    @Autowired
    private ProductSyncOrchestrator syncOrchestrator;

    @Autowired
    private EcSyncConfigService syncConfigService;

    @Autowired
    private EcProductMappingService mappingService;

    @Async
    @EventListener
    public void onStockChange(StockChangeEvent event) {
        Long tenantId = event.getTenantId();
        Long styleId = event.getStyleId();
        List<EcSyncConfig> configs = syncConfigService.listEnabledByTenant(tenantId);
        for (EcSyncConfig config : configs) {
            List<?> mappings = mappingService.listByStyleAndPlatform(styleId, config.getPlatformCode(), tenantId);
            if (mappings.isEmpty()) {
                continue;
            }
            try {
                syncOrchestrator.pushStockToPlatform(styleId, config.getPlatformCode(), tenantId);
            } catch (Exception e) {
                log.warn("[同步事件] 库存同步失败 平台={} 款号={}", config.getPlatformCode(), styleId, e);
            }
        }
    }

    @Async
    @EventListener
    public void onPriceChange(PriceChangeEvent event) {
        Long tenantId = event.getTenantId();
        Long styleId = event.getStyleId();
        List<EcSyncConfig> configs = syncConfigService.listEnabledByTenant(tenantId);
        for (EcSyncConfig config : configs) {
            List<?> mappings = mappingService.listByStyleAndPlatform(styleId, config.getPlatformCode(), tenantId);
            if (mappings.isEmpty()) continue;
            try {
                syncOrchestrator.pushPriceToPlatform(styleId, config.getPlatformCode(), tenantId);
            } catch (Exception e) {
                log.warn("[同步事件] 价格同步失败 平台={} 款号={}", config.getPlatformCode(), styleId, e);
            }
        }
    }
}
