package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProductionCleanupOrchestratorTest {

    @Mock
    private ScanRecordService scanRecordService;

    @Mock
    private ProductWarehousingService productWarehousingService;

    @Mock
    private ProductOutstockService productOutstockService;

    @Mock
    private MaterialPurchaseService materialPurchaseService;

    @Mock
    private ProductionOrderService productionOrderService;

    @Mock
    private CuttingTaskService cuttingTaskService;

    @Mock
    private CuttingBundleService cuttingBundleService;

    @Mock
    private ShipmentReconciliationService shipmentReconciliationService;

    @Mock
    private MaterialReconciliationService materialReconciliationService;

    @InjectMocks
    private ProductionCleanupOrchestrator orchestrator;

    // ---- cleanupFakeProcurementRecords ----

    @Test
    void cleanupFakeProcurementRecords_neverThrows() {
        when(scanRecordService.remove(any())).thenReturn(true);

        // try-catch 内部包裹 → 绝不抛出
        orchestrator.cleanupFakeProcurementRecords();
    }

    @Test
    void cleanupFakeProcurementRecords_serviceThrows_stillNoThrow() {
        when(scanRecordService.remove(any())).thenThrow(new RuntimeException("DB error"));

        // 内部捕获异常，不向外传播
        orchestrator.cleanupFakeProcurementRecords();
    }

    // ---- cleanupOrphanData ----

    @Test
    void cleanupOrphanData_noPurchases_completesWithoutError() {
        when(materialPurchaseService.list(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        orchestrator.cleanupOrphanData();

        verify(materialPurchaseService, atLeastOnce()).list(any(LambdaQueryWrapper.class));
    }

    @Test
    void cleanupOrphanData_orphanPurchase_softDeletes() {
        MaterialPurchase orphan = new MaterialPurchase();
        orphan.setId("P001");
        orphan.setOrderId("ORDER_GONE");
        orphan.setDeleteFlag(0);
        when(materialPurchaseService.list(any(LambdaQueryWrapper.class))).thenReturn(List.of(orphan));
        // productionOrderService.getById 返回 null → 视为孤儿
        when(productionOrderService.getById(any())).thenReturn(null);

        orchestrator.cleanupOrphanData();

        verify(materialPurchaseService, atLeastOnce()).update(any(), any());
    }

    // ---- cleanupSince ----

    @Test
    void cleanupSince_nullCutoff_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.cleanupSince(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("参数错误");
    }

    @Test
    void cleanupSince_validCutoff_returnsStatsMap() {
        LocalDateTime cutoff = LocalDateTime.now().minusDays(7);
        when(scanRecordService.list(any(LambdaQueryWrapper.class))).thenReturn(List.of());
        when(productWarehousingService.list(any(LambdaQueryWrapper.class))).thenReturn(List.of());
        when(productOutstockService.list(any(LambdaQueryWrapper.class))).thenReturn(List.of());
        when(materialPurchaseService.list(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        Map<String, Object> result = orchestrator.cleanupSince(cutoff);

        assertThat(result).containsKeys("from", "scanDeleted", "warehousingDeleted",
                "outstockDeleted", "purchaseDeleted");
        assertThat(result.get("from")).isEqualTo(cutoff);
    }

    // ---- deleteFullLinkByOrderKey ----

    @Test
    void deleteFullLinkByOrderKey_nullKey_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.deleteFullLinkByOrderKey(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("参数错误");
    }

    @Test
    void deleteFullLinkByOrderKey_blankKey_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.deleteFullLinkByOrderKey("  "))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void deleteFullLinkByOrderKey_orderNotFound_throwsNoSuchElement() {
        when(productionOrderService.getById(any())).thenReturn(null);
        when(productionOrderService.getOne(any())).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.deleteFullLinkByOrderKey("UNKNOWN_ORDER"))
                .isInstanceOf(NoSuchElementException.class)
                .hasMessageContaining("生产订单不存在");
    }

    @Test
    void deleteFullLinkByOrderKey_validOrder_executesCleanup() {
        ProductionOrder order = new ProductionOrder();
        order.setId("ORDER001");
        order.setOrderNo("PO2026001");
        when(productionOrderService.getById("ORDER001")).thenReturn(order);

        when(cuttingBundleService.list(any(LambdaQueryWrapper.class))).thenReturn(List.of());
        when(materialPurchaseService.list(any(LambdaQueryWrapper.class))).thenReturn(List.of());
        when(shipmentReconciliationService.list(any(LambdaQueryWrapper.class))).thenReturn(List.of());
        // materialReconciliationService and cuttingTaskService use count()/remove(), not list() — no stub needed
        when(scanRecordService.count(any())).thenReturn(0L);
        when(productWarehousingService.count(any())).thenReturn(0L);
        when(productOutstockService.count(any())).thenReturn(0L);

        Map<String, Object> result = orchestrator.deleteFullLinkByOrderKey("ORDER001");

        assertThat(result).isNotNull();
    }
}
