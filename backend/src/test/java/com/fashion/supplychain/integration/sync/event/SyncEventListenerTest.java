package com.fashion.supplychain.integration.sync.event;

import com.fashion.supplychain.integration.sync.entity.EcProductMapping;
import com.fashion.supplychain.integration.sync.orchestration.ProductSyncOrchestrator;
import com.fashion.supplychain.integration.sync.service.EcProductMappingService;
import com.fashion.supplychain.integration.sync.service.EcSyncConfigService;
import com.fashion.supplychain.integration.sync.entity.EcSyncConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.Collections;
import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("SyncEventListener - 电商同步事件监听器")
class SyncEventListenerTest {

    @Mock
    private ProductSyncOrchestrator syncOrchestrator;

    @Mock
    private EcSyncConfigService syncConfigService;

    @Mock
    private EcProductMappingService mappingService;

    @InjectMocks
    private SyncEventListener listener;

    private EcProductMapping buildMapping() {
        EcProductMapping mapping = new EcProductMapping();
        mapping.setId(1L);
        mapping.setStyleId(100L);
        mapping.setPlatformCode("TAOBAO");
        mapping.setPlatformItemId("item-001");
        mapping.setPlatformSkuId("sku-001");
        return mapping;
    }

    @Nested
    @DisplayName("onStockChange - 库存变更事件")
    class OnStockChange {

        @Test
        @DisplayName("有启用的平台配置-触发同步")
        void withEnabledConfig_triggersSync() {
            EcSyncConfig config = new EcSyncConfig();
            config.setId(1L);
            config.setPlatformCode("TAOBAO");
            config.setEnabled(true);

            StockChangeEvent event = new StockChangeEvent(this, 100L, 200L, 1L, "STOCK_UPDATE");
            when(syncConfigService.listEnabledByTenant(1L)).thenReturn(List.of(config));
            when(mappingService.listByStyleAndPlatform(100L, "TAOBAO", 1L)).thenReturn(List.of(buildMapping()));
            doNothing().when(syncOrchestrator).pushStockToPlatform(100L, "TAOBAO", 1L);

            listener.onStockChange(event);

            verify(syncOrchestrator).pushStockToPlatform(100L, "TAOBAO", 1L);
        }

        @Test
        @DisplayName("无启用的平台配置-不触发同步")
        void withoutEnabledConfig_noSync() {
            StockChangeEvent event = new StockChangeEvent(this, 100L, 200L, 1L, "STOCK_UPDATE");
            when(syncConfigService.listEnabledByTenant(1L)).thenReturn(Collections.emptyList());

            listener.onStockChange(event);

            verify(syncOrchestrator, never()).pushStockToPlatform(anyLong(), anyString(), anyLong());
        }

        @Test
        @DisplayName("无商品映射-跳过同步")
        void withoutMapping_skipsSync() {
            EcSyncConfig config = new EcSyncConfig();
            config.setId(1L);
            config.setPlatformCode("TAOBAO");
            config.setEnabled(true);

            StockChangeEvent event = new StockChangeEvent(this, 100L, 200L, 1L, "STOCK_UPDATE");
            when(syncConfigService.listEnabledByTenant(1L)).thenReturn(List.of(config));
            when(mappingService.listByStyleAndPlatform(100L, "TAOBAO", 1L)).thenReturn(Collections.emptyList());

            listener.onStockChange(event);

            verify(syncOrchestrator, never()).pushStockToPlatform(anyLong(), anyString(), anyLong());
        }

        @Test
        @DisplayName("同步异常-不阻断其他平台")
        void syncException_doesNotBlockOtherPlatforms() {
            EcSyncConfig taobaoConfig = new EcSyncConfig();
            taobaoConfig.setId(1L);
            taobaoConfig.setPlatformCode("TAOBAO");
            taobaoConfig.setEnabled(true);

            EcSyncConfig jdConfig = new EcSyncConfig();
            jdConfig.setId(2L);
            jdConfig.setPlatformCode("JD");
            jdConfig.setEnabled(true);

            StockChangeEvent event = new StockChangeEvent(this, 100L, 200L, 1L, "STOCK_UPDATE");
            when(syncConfigService.listEnabledByTenant(1L)).thenReturn(List.of(taobaoConfig, jdConfig));
            when(mappingService.listByStyleAndPlatform(100L, "TAOBAO", 1L)).thenReturn(List.of(buildMapping()));
            when(mappingService.listByStyleAndPlatform(100L, "JD", 1L)).thenReturn(List.of(buildMapping()));
            doThrow(new RuntimeException("淘宝同步失败")).when(syncOrchestrator).pushStockToPlatform(100L, "TAOBAO", 1L);
            doNothing().when(syncOrchestrator).pushStockToPlatform(100L, "JD", 1L);

            listener.onStockChange(event);

            verify(syncOrchestrator).pushStockToPlatform(100L, "JD", 1L);
        }

        @Test
        @DisplayName("多平台同时同步")
        void multiplePlatforms_syncAll() {
            EcSyncConfig taobaoConfig = new EcSyncConfig();
            taobaoConfig.setId(1L);
            taobaoConfig.setPlatformCode("TAOBAO");
            taobaoConfig.setEnabled(true);

            EcSyncConfig jdConfig = new EcSyncConfig();
            jdConfig.setId(2L);
            jdConfig.setPlatformCode("JD");
            jdConfig.setEnabled(true);

            EcSyncConfig pddConfig = new EcSyncConfig();
            pddConfig.setId(3L);
            pddConfig.setPlatformCode("PDD");
            pddConfig.setEnabled(true);

            StockChangeEvent event = new StockChangeEvent(this, 100L, 200L, 1L, "STOCK_UPDATE");
            when(syncConfigService.listEnabledByTenant(1L)).thenReturn(List.of(taobaoConfig, jdConfig, pddConfig));
            when(mappingService.listByStyleAndPlatform(eq(100L), anyString(), eq(1L))).thenReturn(List.of(buildMapping()));
            doNothing().when(syncOrchestrator).pushStockToPlatform(anyLong(), anyString(), anyLong());

            listener.onStockChange(event);

            verify(syncOrchestrator).pushStockToPlatform(100L, "TAOBAO", 1L);
            verify(syncOrchestrator).pushStockToPlatform(100L, "JD", 1L);
            verify(syncOrchestrator).pushStockToPlatform(100L, "PDD", 1L);
        }
    }

    @Nested
    @DisplayName("onPriceChange - 价格变更事件")
    class OnPriceChange {

        @Test
        @DisplayName("有启用的平台配置-触发价格同步")
        void withEnabledConfig_triggersSync() {
            EcSyncConfig config = new EcSyncConfig();
            config.setId(1L);
            config.setPlatformCode("TAOBAO");
            config.setEnabled(true);

            PriceChangeEvent event = new PriceChangeEvent(this, 100L, 1L);
            when(syncConfigService.listEnabledByTenant(1L)).thenReturn(List.of(config));
            when(mappingService.listByStyleAndPlatform(100L, "TAOBAO", 1L)).thenReturn(List.of(buildMapping()));
            doNothing().when(syncOrchestrator).pushPriceToPlatform(100L, "TAOBAO", 1L);

            listener.onPriceChange(event);

            verify(syncOrchestrator).pushPriceToPlatform(100L, "TAOBAO", 1L);
        }

        @Test
        @DisplayName("无启用的平台配置-不触发同步")
        void withoutEnabledConfig_noSync() {
            PriceChangeEvent event = new PriceChangeEvent(this, 100L, 1L);
            when(syncConfigService.listEnabledByTenant(1L)).thenReturn(Collections.emptyList());

            listener.onPriceChange(event);

            verify(syncOrchestrator, never()).pushPriceToPlatform(anyLong(), anyString(), anyLong());
        }

        @Test
        @DisplayName("无商品映射-跳过同步")
        void withoutMapping_skipsSync() {
            EcSyncConfig config = new EcSyncConfig();
            config.setId(1L);
            config.setPlatformCode("TAOBAO");
            config.setEnabled(true);

            PriceChangeEvent event = new PriceChangeEvent(this, 100L, 1L);
            when(syncConfigService.listEnabledByTenant(1L)).thenReturn(List.of(config));
            when(mappingService.listByStyleAndPlatform(100L, "TAOBAO", 1L)).thenReturn(Collections.emptyList());

            listener.onPriceChange(event);

            verify(syncOrchestrator, never()).pushPriceToPlatform(anyLong(), anyString(), anyLong());
        }

        @Test
        @DisplayName("同步异常-静默处理不阻断")
        void syncException_silentHandling() {
            EcSyncConfig config = new EcSyncConfig();
            config.setId(1L);
            config.setPlatformCode("TAOBAO");
            config.setEnabled(true);

            PriceChangeEvent event = new PriceChangeEvent(this, 100L, 1L);
            when(syncConfigService.listEnabledByTenant(1L)).thenReturn(List.of(config));
            when(mappingService.listByStyleAndPlatform(100L, "TAOBAO", 1L)).thenReturn(List.of(buildMapping()));
            doThrow(new RuntimeException("价格同步失败")).when(syncOrchestrator).pushPriceToPlatform(100L, "TAOBAO", 1L);

            listener.onPriceChange(event);

            verify(syncOrchestrator).pushPriceToPlatform(100L, "TAOBAO", 1L);
        }
    }
}
