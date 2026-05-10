package com.fashion.supplychain.integration.sync.job;

import com.fashion.supplychain.integration.sync.orchestration.ProductSyncOrchestrator;
import com.fashion.supplychain.integration.sync.service.EcProductMappingService;
import com.fashion.supplychain.integration.sync.service.EcSyncConfigService;
import com.fashion.supplychain.integration.sync.service.EcSyncLogService;
import com.fashion.supplychain.integration.sync.entity.EcProductMapping;
import com.fashion.supplychain.integration.sync.entity.EcSyncConfig;
import com.fashion.supplychain.integration.sync.entity.EcSyncLog;
import com.fashion.supplychain.integration.sync.adapter.EcPlatformAdapter;
import com.fashion.supplychain.integration.sync.adapter.EcPlatformAdapterRegistry;
import com.fashion.supplychain.integration.sync.dto.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.*;

@Component
@Slf4j
public class EcSyncJob {

    @Autowired
    private EcSyncConfigService syncConfigService;

    @Autowired
    private EcProductMappingService mappingService;

    @Autowired
    private EcSyncLogService syncLogService;

    @Autowired
    private ProductSyncOrchestrator syncOrchestrator;

    @Autowired
    private EcPlatformAdapterRegistry adapterRegistry;

    @Autowired
    private com.fashion.supplychain.integration.sync.service.EcStockCalculator stockCalculator;

    @Scheduled(fixedRate = 300000, initialDelay = 60000)
    public void stockSyncJob() {
        log.debug("[定时同步] 库存增量同步开始");
        List<EcSyncConfig> allConfigs = syncConfigService.list();
        for (EcSyncConfig config : allConfigs) {
            if (!Boolean.TRUE.equals(config.getEnabled())) continue;
            try {
                syncStockForConfig(config);
            } catch (Exception e) {
                log.warn("[定时同步] 库存同步失败 平台={}", config.getPlatformCode(), e);
            }
        }
    }

    @Scheduled(fixedRate = 30000, initialDelay = 30000)
    public void retryJob() {
        List<EcSyncLog> retryable = syncLogService.findRetryable();
        for (EcSyncLog syncLog : retryable) {
            try {
                retrySync(syncLog);
            } catch (Exception e) {
                log.warn("[重试调度] 重试失败 logId={}", syncLog.getId(), e);
            }
        }
    }

    private void syncStockForConfig(EcSyncConfig config) {
        Optional<EcPlatformAdapter> optAdapter = adapterRegistry.findAdapter(config.getPlatformCode());
        if (optAdapter.isEmpty()) return;
        EcPlatformAdapter adapter = optAdapter.get();
        EcSyncContext ctx = EcSyncContext.builder()
                .tenantId(config.getTenantId())
                .platformCode(config.getPlatformCode())
                .appId(config.getAppId())
                .appSecret(config.getAppSecret())
                .callbackUrl(config.getCallbackUrl())
                .extraConfig(config.getExtraConfig())
                .build();
        List<EcProductMapping> mappings = mappingService.listPendingByPlatform(
                config.getPlatformCode(), config.getTenantId());
        if (mappings.isEmpty()) return;
        List<EcStockSyncItem> items = new ArrayList<>();
        for (EcProductMapping m : mappings) {
            if (m.getSkuId() == null || m.getPlatformSkuId() == null) continue;
            int qty = stockCalculator.calculateAvailableStock(m.getStyleId(), m.getSkuId());
            items.add(EcStockSyncItem.builder()
                    .skuId(m.getSkuId())
                    .platformSkuId(m.getPlatformSkuId())
                    .quantity(qty)
                    .build());
        }
        if (items.isEmpty()) return;
        EcStockSyncResult result = adapter.pushStock(ctx, items);
        if (result.isSuccess()) {
            syncConfigService.updateLastSyncAt(config.getId());
            log.info("[定时同步] 库存同步完成 平台={} 同步{}条", config.getPlatformCode(), result.getSyncedCount());
        }
    }

    private void retrySync(EcSyncLog syncLog) {
        syncLog.setRetryCount(syncLog.getRetryCount() + 1);
        syncLog.setStatus("RETRYING");
        syncLogService.updateById(syncLog);
        try {
            String syncType = syncLog.getSyncType();
            switch (syncType) {
                case "STOCK_SYNC" -> syncOrchestrator.pushStockToPlatform(
                        syncLog.getStyleId(), syncLog.getPlatformCode(), syncLog.getTenantId());
                case "PRICE_SYNC" -> syncOrchestrator.pushPriceToPlatform(
                        syncLog.getStyleId(), syncLog.getPlatformCode(), syncLog.getTenantId());
                default -> log.warn("[重试调度] 不支持的同步类型: {}", syncType);
            }
            syncLog.setStatus("SYNCED");
            syncLogService.updateById(syncLog);
        } catch (Exception e) {
            if (syncLog.getRetryCount() >= syncLog.getMaxRetries()) {
                syncLog.setStatus("DEAD_LETTER");
            } else {
                syncLog.setStatus("FAILED");
                int[] delays = {30, 120, 600};
                int delay = syncLog.getRetryCount() < delays.length ? delays[syncLog.getRetryCount()] : 600;
                syncLog.setNextRetryAt(java.time.LocalDateTime.now().plusSeconds(delay));
            }
            syncLog.setErrorMessage(e.getMessage() != null && e.getMessage().length() > 1000
                    ? e.getMessage().substring(0, 1000) : e.getMessage());
            syncLogService.updateById(syncLog);
        }
    }
}
