package com.fashion.supplychain.integration.sync.event;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * StockChangePublisher 契约测试。
 *
 * <p>守护的核心契约：<b>宁可不发布，也不发布半残事件</b>。
 * 缺失 tenantId/skuCode/找不到 SKU 时必须静默跳过，
 * 否则下游 {@code EcStockSyncEventListener} 会以 null skuId 重算库存，
 * 把整款库存写成 skuCode=null 的脏行。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("StockChangePublisher - 库存变更事件发布器")
class StockChangePublisherTest {

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @Mock
    private ProductSkuService productSkuService;

    @InjectMocks
    private StockChangePublisher publisher;

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    private ProductSku sku(Long id, Long styleId, String skuCode, Long tenantId) {
        ProductSku s = new ProductSku();
        s.setId(id);
        s.setStyleId(styleId);
        s.setSkuCode(skuCode);
        s.setTenantId(tenantId);
        return s;
    }

    private void stubSku(ProductSku s) {
        when(productSkuService.getOne(ArgumentMatchers.<Wrapper<ProductSku>>any(), anyBoolean())).thenReturn(s);
    }

    @Nested
    @DisplayName("参数校验 - 不发布半残事件")
    class ParamGuard {

        @Test
        @DisplayName("tenantId 为空 - 不发布")
        void nullTenantId_noPublish() {
            publisher.publishAfterCommit(null, "S-001-RED-M", "OUTBOUND");

            verify(eventPublisher, never()).publishEvent(any(StockChangeEvent.class));
        }

        @Test
        @DisplayName("skuCode 为空 - 不发布")
        void blankSkuCode_noPublish() {
            publisher.publishAfterCommit(1L, "   ", "OUTBOUND");

            verify(eventPublisher, never()).publishEvent(any(StockChangeEvent.class));
        }

        @Test
        @DisplayName("找不到 SKU - 不发布（不编造 styleId/skuId）")
        void skuNotFound_noPublish() {
            stubSku(null);

            publisher.publishAfterCommit(1L, "NOT-EXIST", "OUTBOUND");

            verify(eventPublisher, never()).publishEvent(any(StockChangeEvent.class));
        }

        @Test
        @DisplayName("SKU 缺少 styleId - 不发布")
        void skuWithoutStyleId_noPublish() {
            stubSku(sku(9L, null, "S-001-RED-M", 1L));

            publisher.publishAfterCommit(1L, "S-001-RED-M", "OUTBOUND");

            verify(eventPublisher, never()).publishEvent(any(StockChangeEvent.class));
        }
    }

    @Nested
    @DisplayName("正常发布")
    class NormalPublish {

        @Test
        @DisplayName("无事务 - 立即发布且字段正确")
        void noTransaction_publishesImmediately() {
            stubSku(sku(9L, 100L, "S-001-RED-M", 1L));

            publisher.publishAfterCommit(1L, "S-001-RED-M", "INBOUND");

            ArgumentCaptor<StockChangeEvent> captor = ArgumentCaptor.forClass(StockChangeEvent.class);
            verify(eventPublisher).publishEvent(captor.capture());
            StockChangeEvent event = captor.getValue();
            assertThat(event.getTenantId()).isEqualTo(1L);
            assertThat(event.getStyleId()).isEqualTo(100L);
            assertThat(event.getSkuId()).isEqualTo(9L);
            assertThat(event.getChangeType()).isEqualTo("INBOUND");
        }

        @Test
        @DisplayName("skuCode 首尾空格 - 归一化后再匹配")
        void trimsSkuCode() {
            stubSku(sku(9L, 100L, "S-001-RED-M", 1L));

            publisher.publishAfterCommit(1L, "  S-001-RED-M  ", "OUTBOUND");

            verify(eventPublisher).publishEvent(any(StockChangeEvent.class));
        }
    }

    @Nested
    @DisplayName("事务语义 - 提交后才发布")
    class TransactionSemantics {

        @Test
        @DisplayName("事务未提交 - 不发布；提交后 - 发布")
        void activeTransaction_defersUntilAfterCommit() {
            stubSku(sku(9L, 100L, "S-001-RED-M", 1L));
            TransactionSynchronizationManager.initSynchronization();
            try {
                publisher.publishAfterCommit(1L, "S-001-RED-M", "OUTBOUND");

                // 事务尚未提交：下游若此刻重算会读到未提交的出库记录
                verify(eventPublisher, never()).publishEvent(any(StockChangeEvent.class));

                TransactionSynchronizationManager.getSynchronizations()
                        .forEach(TransactionSynchronization::afterCommit);

                verify(eventPublisher).publishEvent(any(StockChangeEvent.class));
            } finally {
                TransactionSynchronizationManager.clearSynchronization();
            }
        }

        @Test
        @DisplayName("事务回滚 - 不发布")
        void rolledBackTransaction_noPublish() {
            stubSku(sku(9L, 100L, "S-001-RED-M", 1L));
            TransactionSynchronizationManager.initSynchronization();
            try {
                publisher.publishAfterCommit(1L, "S-001-RED-M", "OUTBOUND");

                TransactionSynchronizationManager.getSynchronizations()
                        .forEach(s -> s.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));

                verify(eventPublisher, never()).publishEvent(any(StockChangeEvent.class));
            } finally {
                TransactionSynchronizationManager.clearSynchronization();
            }
        }
    }
}
