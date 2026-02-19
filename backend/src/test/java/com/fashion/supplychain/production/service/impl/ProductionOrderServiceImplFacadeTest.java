package com.fashion.supplychain.production.service.impl;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionOrderFinanceOrchestrationService;
import com.fashion.supplychain.production.orchestration.ProductionOrderProgressOrchestrationService;
import com.fashion.supplychain.production.service.ProductionOrderProgressRecomputeService;
import com.fashion.supplychain.production.service.ProductionOrderQueryService;
import java.math.BigDecimal;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;

@ExtendWith(MockitoExtension.class)
class ProductionOrderServiceImplFacadeTest {

    @Mock
    private ProductionOrderQueryService productionOrderQueryService;

    @Mock
    private ProductionOrderProgressOrchestrationService progressOrchestrationService;

    @Mock
    private ProductionOrderFinanceOrchestrationService financeOrchestrationService;

    @Mock
    private ObjectProvider<ProductionOrderProgressOrchestrationService> progressOrchestrationServiceProvider;

    @Mock
    private ObjectProvider<ProductionOrderFinanceOrchestrationService> financeOrchestrationServiceProvider;

    @Mock
    private ProductionOrderProgressRecomputeService progressRecomputeService;

    @InjectMocks
    private ProductionOrderServiceImpl service;

    @Test
    void queryPage_delegatesToQueryService() {
        Map<String, Object> params = Map.of("page", "1");
        @SuppressWarnings("unchecked")
        IPage<ProductionOrder> expected = (IPage<ProductionOrder>) org.mockito.Mockito.mock(IPage.class);
        when(productionOrderQueryService.queryPage(params)).thenReturn(expected);

        IPage<ProductionOrder> actual = service.queryPage(params);

        assertSame(expected, actual);
        verify(productionOrderQueryService).queryPage(params);
    }

    @Test
    void getDetailById_delegatesToQueryService() {
        ProductionOrder expected = new ProductionOrder();
        when(productionOrderQueryService.getDetailById("o1")).thenReturn(expected);

        ProductionOrder actual = service.getDetailById("o1");

        assertSame(expected, actual);
        verify(productionOrderQueryService).getDetailById("o1");
    }

    @Test
    void updateProductionProgress_returnsFalseOnException() {
        when(progressOrchestrationServiceProvider.getIfAvailable()).thenReturn(progressOrchestrationService);
        when(progressOrchestrationService.updateProductionProgress("o1", 10, null, null))
                .thenThrow(new RuntimeException("boom"));

        assertFalse(service.updateProductionProgress("o1", 10));
    }

    @Test
    void updateProductionProgress_withRollback_delegates() {
        when(progressOrchestrationServiceProvider.getIfAvailable()).thenReturn(progressOrchestrationService);
        when(progressOrchestrationService.updateProductionProgress("o1", 10, "r", "p")).thenReturn(true);

        service.updateProductionProgress("o1", 10, "r", "p");

        verify(progressOrchestrationService).updateProductionProgress("o1", 10, "r", "p");
    }

    @Test
    void updateMaterialArrivalRate_returnsFalseOnException() {
        when(progressOrchestrationServiceProvider.getIfAvailable()).thenReturn(progressOrchestrationService);
        when(progressOrchestrationService.updateMaterialArrivalRate("o1", 20)).thenThrow(new RuntimeException());

        assertFalse(service.updateMaterialArrivalRate("o1", 20));
    }

    @Test
    void completeProduction_delegates() {
        when(financeOrchestrationServiceProvider.getIfAvailable()).thenReturn(financeOrchestrationService);
        when(financeOrchestrationService.completeProduction("o1", BigDecimal.ONE)).thenReturn(true);

        service.completeProduction("o1", BigDecimal.ONE);

        verify(financeOrchestrationService).completeProduction("o1", BigDecimal.ONE);
    }

    @Test
    void closeOrder_delegates() {
        ProductionOrder expected = new ProductionOrder();
        when(financeOrchestrationServiceProvider.getIfAvailable()).thenReturn(financeOrchestrationService);
        when(financeOrchestrationService.closeOrder("o1")).thenReturn(expected);

        ProductionOrder actual = service.closeOrder("o1");

        assertSame(expected, actual);
        verify(financeOrchestrationService).closeOrder("o1");
    }

    @Test
    void recomputeProgressFromRecords_delegates() {
        ProductionOrder expected = new ProductionOrder();
        when(progressRecomputeService.recomputeProgressFromRecords("o1")).thenReturn(expected);

        ProductionOrder actual = service.recomputeProgressFromRecords("o1");

        assertSame(expected, actual);
        verify(progressRecomputeService).recomputeProgressFromRecords("o1");
    }
}
