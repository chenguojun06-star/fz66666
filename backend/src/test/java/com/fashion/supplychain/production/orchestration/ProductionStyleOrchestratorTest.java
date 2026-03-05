package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.service.StyleInfoService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProductionStyleOrchestratorTest {

    @InjectMocks
    private ProductionStyleOrchestrator orchestrator;

    @Mock private ProductionOrderService productionOrderService;
    @Mock private StyleInfoService styleInfoService;

    // ── listOrdersByStyleId ───────────────────────────────────────────

    @Test
    void listOrdersByStyleId_nullId_returnsEmptyList() {
        List<ProductionOrder> result = orchestrator.listOrdersByStyleId(null);
        assertThat(result).isEmpty();
        verifyNoInteractions(productionOrderService);
    }

    // ── listOrdersByStyleNo ───────────────────────────────────────────

    @Test
    void listOrdersByStyleNo_nullStyleNo_returnsEmptyList() {
        List<ProductionOrder> result = orchestrator.listOrdersByStyleNo(null);
        assertThat(result).isEmpty();
        verifyNoInteractions(productionOrderService);
    }

    @Test
    void listOrdersByStyleNo_blankStyleNo_returnsEmptyList() {
        List<ProductionOrder> result = orchestrator.listOrdersByStyleNo("   ");
        assertThat(result).isEmpty();
        verifyNoInteractions(productionOrderService);
    }

    @Test
    void listOrdersByStyleNo_emptyString_returnsEmptyList() {
        List<ProductionOrder> result = orchestrator.listOrdersByStyleNo("");
        assertThat(result).isEmpty();
        verifyNoInteractions(productionOrderService);
    }

    // ── getStyleInfoByOrderId ────────────────────────────────────────

    @Test
    void getStyleInfoByOrderId_nullId_returnsNull() {
        assertThat(orchestrator.getStyleInfoByOrderId(null)).isNull();
        verifyNoInteractions(productionOrderService);
    }

    @Test
    void getStyleInfoByOrderId_blankId_returnsNull() {
        assertThat(orchestrator.getStyleInfoByOrderId("  ")).isNull();
        verifyNoInteractions(productionOrderService);
    }

    @Test
    void getStyleInfoByOrderId_orderNotFound_returnsNull() {
        when(productionOrderService.getById(anyString())).thenReturn(null);
        assertThat(orchestrator.getStyleInfoByOrderId("ORDER001")).isNull();
        verifyNoInteractions(styleInfoService);
    }

    @Test
    void getStyleInfoByOrderId_orderWithNoStyleId_returnsNull() {
        ProductionOrder order = new ProductionOrder();
        order.setId("ORDER001");
        order.setStyleId(null);
        when(productionOrderService.getById("ORDER001")).thenReturn(order);

        assertThat(orchestrator.getStyleInfoByOrderId("ORDER001")).isNull();
        verifyNoInteractions(styleInfoService);
    }
}
