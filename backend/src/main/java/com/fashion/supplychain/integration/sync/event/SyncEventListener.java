package com.fashion.supplychain.integration.sync.event;

import com.fashion.supplychain.integration.sync.orchestration.ProductSyncOrchestrator;
import com.fashion.supplychain.integration.sync.service.EcProductMappingService;
import com.fashion.supplychain.integration.sync.service.EcSyncConfigService;
import com.fashion.supplychain.integration.sync.entity.EcSyncConfig;
import com.fashion.supplychain.system.service.BackendActionFlagService;
import com.fashion.supplychain.system.service.BackendActionFlagService.BackendActionKey;
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

    /** 后端动作开关：与 EcStockOrchestrator.pushStockToPlatform 保持同一开关，避免绕过"不自动执行"原则 */
    @Autowired(required = false)
    private BackendActionFlagService backendActionFlagService;

    @Async
    @EventListener
    public void onStockChange(StockChangeEvent event) {
        Long tenantId = event.getTenantId();
        Long styleId = event.getStyleId();
        // 遵循"智能化不自动执行，让用户可以设置"原则：开关未开启时只重算本地库存、不推送平台
        boolean pushEnabled = backendActionFlagService != null
                && backendActionFlagService.isEnabled(tenantId, BackendActionKey.AUTO_EC_STOCK_SYNC);
        if (!pushEnabled) {
            log.debug("[同步事件] 电商库存自动同步开关未开启，跳过平台推送 tenantId={} styleId={}", tenantId, styleId);
            return;
        }
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
