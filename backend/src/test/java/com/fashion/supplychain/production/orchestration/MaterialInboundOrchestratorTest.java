package com.fashion.supplychain.production.orchestration;

import java.math.BigDecimal;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.orchestration.MaterialReconciliationSyncOrchestrator;
import com.fashion.supplychain.production.entity.MaterialInbound;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.service.MaterialInboundService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import com.fashion.supplychain.warehouse.orchestration.MaterialPickupOrchestrator;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MaterialInboundOrchestratorTest {

    @Mock
    private MaterialInboundService materialInboundService;

    @Mock
    private MaterialPurchaseService materialPurchaseService;

    @Mock
    private MaterialStockService materialStockService;

    @Mock
    private MaterialReconciliationSyncOrchestrator materialReconciliationSyncOrchestrator;

    @Mock
    private MaterialPickupOrchestrator materialPickupOrchestrator;

    @InjectMocks
    private MaterialInboundOrchestrator materialInboundOrchestrator;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        UserContext.set(ctx);
    }

    @Test
    void confirmArrivalAndInbound_withNonexistentPurchase_throwsException() {
        when(materialPurchaseService.getById(anyString())).thenReturn(null);

        assertThatThrownBy(() ->
            materialInboundOrchestrator.confirmArrivalAndInbound(
                "P001", 10, "A仓", "op1", "张三", "备注"))
            .isInstanceOf(RuntimeException.class)
            .hasMessageContaining("采购单不存在");
    }

    @Test
    void confirmArrivalAndInbound_withNullArrivedQuantity_throwsException() {
        MaterialPurchase purchase = buildPurchase("P001", 100, 0);
        when(materialPurchaseService.getById("P001")).thenReturn(purchase);

        assertThatThrownBy(() ->
            materialInboundOrchestrator.confirmArrivalAndInbound(
                "P001", null, "A仓", "op1", "张三", null))
            .isInstanceOf(RuntimeException.class)
            .hasMessageContaining("到货数量");
    }

    @Test
    void confirmArrivalAndInbound_withZeroArrivedQuantity_throwsException() {
        MaterialPurchase purchase = buildPurchase("P001", 100, 0);
        when(materialPurchaseService.getById("P001")).thenReturn(purchase);

        assertThatThrownBy(() ->
            materialInboundOrchestrator.confirmArrivalAndInbound(
                "P001", 0, "A仓", "op1", "张三", null))
            .isInstanceOf(RuntimeException.class)
            .hasMessageContaining("到货数量");
    }

    @Test
    void confirmArrivalAndInbound_exceedsPurchaseQuantity_throwsException() {
        // purchaseQuantity=50, already arrived=40, trying to add 20 => total=60 > 50
        MaterialPurchase purchase = buildPurchase("P001", 50, 40);
        when(materialPurchaseService.getById("P001")).thenReturn(purchase);

        assertThatThrownBy(() ->
            materialInboundOrchestrator.confirmArrivalAndInbound(
                "P001", 20, "A仓", "op1", "张三", null))
            .isInstanceOf(RuntimeException.class)
            .hasMessageContaining("到货数量超出采购数量");
    }

    @Test
    void confirmArrivalAndInbound_partialArrival_setsPartialArrivalStatus() throws Exception {
        MaterialPurchase purchase = buildPurchase("P001", 100, 0);
        purchase.setMaterialCode("MC001");
        purchase.setMaterialName("面料A");
        purchase.setSupplierName("供应商A");

        when(materialPurchaseService.getById("P001")).thenReturn(purchase);
        when(materialInboundService.generateInboundNo()).thenReturn("IN202601001");
        when(materialInboundService.save(any(MaterialInbound.class))).thenReturn(true);
        doNothing().when(materialStockService).increaseStock(any(), anyInt(), anyString());
        when(materialPurchaseService.updateById(any())).thenReturn(true);
        when(materialReconciliationSyncOrchestrator.syncFromInbound(any(), any())).thenReturn("rec001");

        Map<String, Object> result = materialInboundOrchestrator.confirmArrivalAndInbound(
            "P001", 40, "A仓", "op1", "张三", "备注");

        assertThat(result.get("success")).isEqualTo(true);
        assertThat(result.get("inboundNo")).isEqualTo("IN202601001");
        assertThat(result.get("status")).isEqualTo("partial_arrival");
    }

    @Test
    void confirmArrivalAndInbound_fullArrival_setsCompletedStatus() throws Exception {
        MaterialPurchase purchase = buildPurchase("P001", 50, 0);
        purchase.setMaterialCode("MC001");
        purchase.setMaterialName("面料A");
        purchase.setSupplierName("供应商A");

        when(materialPurchaseService.getById("P001")).thenReturn(purchase);
        when(materialInboundService.generateInboundNo()).thenReturn("IN202601002");
        when(materialInboundService.save(any(MaterialInbound.class))).thenReturn(true);
        doNothing().when(materialStockService).increaseStock(any(), anyInt(), anyString());
        when(materialPurchaseService.updateById(any())).thenReturn(true);
        when(materialReconciliationSyncOrchestrator.syncFromInbound(any(), any())).thenReturn("rec002");

        Map<String, Object> result = materialInboundOrchestrator.confirmArrivalAndInbound(
            "P001", 50, "B仓", "op1", "张三", null);

        assertThat(result.get("status")).isEqualTo("completed");
        assertThat(result.get("arrivedQuantity")).isEqualTo(50);
    }

    @Test
    void manualInbound_withNullMaterialCode_throwsException() {
        assertThatThrownBy(() ->
            materialInboundOrchestrator.manualInbound(
                null, "面料", "面料", null, null, 10,
                "A仓", "供应商", "op1", "张三", null))
            .isInstanceOf(RuntimeException.class)
            .hasMessageContaining("物料编码");
    }

    @Test
    void manualInbound_withZeroQuantity_throwsException() {
        assertThatThrownBy(() ->
            materialInboundOrchestrator.manualInbound(
                "MC001", "面料A", "面料", null, null, 0,
                "A仓", "供应商", "op1", "张三", null))
            .isInstanceOf(RuntimeException.class)
            .hasMessageContaining("入库数量");
    }

    // ─── helper ──────────────────────────────────────────────────────────────

    private MaterialPurchase buildPurchase(String id, int purchaseQty, int arrivedQty) {
        MaterialPurchase p = new MaterialPurchase();
        p.setId(id);
        p.setPurchaseQuantity(new BigDecimal(purchaseQty));
        p.setArrivedQuantity(arrivedQty);
        return p;
    }
}
