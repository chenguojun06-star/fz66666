package com.fashion.supplychain.production.orchestration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.production.entity.ProductionOrder;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

@ExtendWith(MockitoExtension.class)
class ProductionOrderOrchestratorCloseOrderTest {

    @Mock
    private ProductionOrderFinanceOrchestrationService financeOrchestrationService;

    @InjectMocks
    private ProductionOrderOrchestrator orchestrator;

    @Test
    void closeOrder_requiresSourceModule() {
        AccessDeniedException ex = assertThrows(AccessDeniedException.class,
                () -> orchestrator.closeOrder("o1", " "));
        assertEquals("仅允许在指定模块关单", ex.getMessage());
    }

    @Test
    void closeOrder_rejectsUnknownSourceModule() {
        AccessDeniedException ex = assertThrows(AccessDeniedException.class,
                () -> orchestrator.closeOrder("o1", "other"));
        assertEquals("仅允许在我的订单或生产进度关单", ex.getMessage());
    }

    @Test
    void closeOrder_allowsMyOrders() {
        ProductionOrder expected = new ProductionOrder();
        when(financeOrchestrationService.closeOrder("o1")).thenReturn(expected);

        ProductionOrder actual = orchestrator.closeOrder("o1", ProductionOrderOrchestrator.CLOSE_SOURCE_MY_ORDERS);

        assertSame(expected, actual);
        verify(financeOrchestrationService).closeOrder("o1");
    }

    @Test
    void closeOrder_allowsProductionProgressWithTrim() {
        ProductionOrder expected = new ProductionOrder();
        when(financeOrchestrationService.closeOrder("o1")).thenReturn(expected);

        ProductionOrder actual = orchestrator.closeOrder("o1", " productionProgress ");

        assertSame(expected, actual);
        verify(financeOrchestrationService).closeOrder("o1");
    }
}

