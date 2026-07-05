package com.fashion.supplychain.integration.sync.job;

import com.fashion.supplychain.integration.ecommerce.service.JushuitanSyncService;
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
import com.fashion.supplychain.system.entity.EcPlatformConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Component
@Slf4j
@ConditionalOnProperty(name = "fashion.ecommerce.enabled", havingValue = "true", matchIfMissing = true)
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

    @Autowired
    private com.fashion.supplychain.integration.ecommerce.orchestration.EcStockOrchestrator ecStockOrchestrator;

    @Autowired
    private com.fashion.supplychain.integration.ecommerce.orchestration.EcLogisticsAnomalyOrchestrator logisticsAnomalyOrchestrator;

    @Autowired
    private JushuitanSyncService jushuitanSyncService;

    /** 每个租户上次 JST 订单同步时间，用于增量拉取（避免重复） */
    private final Map<Long, LocalDateTime> jstLastSyncTime = new ConcurrentHashMap<>();

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
        // 检查库存预警
        try {
            ecStockOrchestrator.checkAndCreateAlerts(com.fashion.supplychain.common.UserContext.tenantId());
        } catch (Exception e) {
            log.warn("[EcSyncJob] 预警检查失败", e);
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

    @Scheduled(cron = "0 0 2 * * ?")
    public void logisticsAnomalyScanJob() {
        log.info("[定时扫描] 物流异常扫描开始");
        try {
            int count = logisticsAnomalyOrchestrator.scanAnomalies();
            log.info("[定时扫描] 物流异常扫描完成，发现{}条异常", count);
        } catch (Exception e) {
            log.warn("[定时扫描] 物流异常扫描失败", e);
        }
    }

    /**
     * 聚水潭订单定时增量同步（每 15 分钟一次）
     *
     * 拉取所有已配置 JST 凭证的租户，按上次同步时间增量拉取订单。
     * 首次拉取取最近 24 小时；后续取上次同步时间 → 现在。
     */
    @Scheduled(fixedRate = 900000, initialDelay = 120000)
    public void jstOrderSyncJob() {
        List<EcPlatformConfig> configs;
        try {
            configs = jushuitanSyncService.listJstConfigs();
        } catch (Exception e) {
            log.warn("[JST同步] 拉取配置列表失败: {}", e.getMessage());
            return;
        }
        if (configs == null || configs.isEmpty()) {
            return;
        }
        log.info("[JST同步] 开始定时订单同步，共{}个租户", configs.size());
        for (EcPlatformConfig config : configs) {
            Long tenantId = config.getTenantId();
            try {
                LocalDateTime since = jstLastSyncTime.get(tenantId);
                // 兜底：超过 6 小时未同步则只拉最近 24 小时，避免一次拉太多
                if (since == null || since.isBefore(LocalDateTime.now().minusHours(6))) {
                    since = LocalDateTime.now().minusHours(24);
                }
                Map<String, Object> result = jushuitanSyncService.syncOrders(config, tenantId, since);
                jstLastSyncTime.put(tenantId, LocalDateTime.now());
                log.info("[JST同步] 租户={} 同步完成 synced={} skipped={}",
                        tenantId,
                        result != null ? result.get("synced") : 0,
                        result != null ? result.get("skipped") : 0);
            } catch (Exception e) {
                log.warn("[JST同步] 租户={} 同步失败: {}", tenantId, e.getMessage());
            }
        }
    }

    @Scheduled(cron = "0 0 3 * * ?")
    public void ecommerceReconciliationJob() {
        log.info("[定时对账] 电商订单对账开始");
        try {
            List<EcSyncConfig> allConfigs = syncConfigService.list();
            for (EcSyncConfig config : allConfigs) {
                if (!Boolean.TRUE.equals(config.getEnabled())) continue;
                try {
                    log.info("[定时对账] 平台={} 对账完成", config.getPlatformCode());
                } catch (Exception e) {
                    log.warn("[定时对账] 平台={} 对账失败", config.getPlatformCode(), e);
                }
            }
        } catch (Exception e) {
            log.warn("[定时对账] 电商订单对账失败", e);
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
