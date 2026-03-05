package com.fashion.supplychain.warehouse.orchestration;

import com.fashion.supplychain.production.mapper.MaterialDatabaseMapper;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.mapper.MaterialStockMapper;
import com.fashion.supplychain.production.mapper.ProductOutstockMapper;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WarehouseDashboardOrchestratorTest {

    @InjectMocks
    private WarehouseDashboardOrchestrator orchestrator;

    @Mock
    private MaterialDatabaseMapper materialDatabaseMapper;
    @Mock
    private MaterialPurchaseMapper materialPurchaseMapper;
    @Mock
    private ProductWarehousingMapper productWarehousingMapper;
    @Mock
    private MaterialStockMapper materialStockMapper;
    @Mock
    private ProductOutstockMapper productOutstockMapper;

    @Test
    void getWarehouseStats_returnsNonNull() {
        // materialDatabaseMapper.selectCount is called directly and .intValue() is called on result
        when(materialDatabaseMapper.selectCount(any())).thenReturn(0L);
        var result = orchestrator.getWarehouseStats();
        assertThat(result).isNotNull();
    }

    @Test
    void getLowStockItems_returnsNonNull() {
        when(materialStockMapper.selectList(any())).thenReturn(Collections.emptyList());
        var result = orchestrator.getLowStockItems();
        assertThat(result).isNotNull();
    }

    @Test
    void getRecentOperations_returnsNonNull() {
        // Both iteration calls must return non-null to avoid NPE in for-each
        when(materialPurchaseMapper.selectTodayArrivals(any())).thenReturn(Collections.emptyList());
        when(productWarehousingMapper.selectTodayInbound(any())).thenReturn(Collections.emptyList());
        var result = orchestrator.getRecentOperations();
        assertThat(result).isNotNull();
        assertThat(result).isEmpty();
    }

    @Test
    void getTrendData_withDayAndFinished_returnsNonNull() {
        // productWarehousingMapper.selectTodayInboundByHour is iterated without null check
        when(productWarehousingMapper.selectTodayInboundByHour(any())).thenReturn(Collections.emptyList());
        var result = orchestrator.getTrendData("day", "finished");
        assertThat(result).isNotNull();
    }

    @Test
    void getTrendData_withDayAndFabric_returnsNonNull() {
        // materialPurchaseMapper.selectTodayInboundByHourAndType is iterated without null check
        when(materialPurchaseMapper.selectTodayInboundByHourAndType(any(), any())).thenReturn(Collections.emptyList());
        var result = orchestrator.getTrendData("day", "fabric");
        assertThat(result).isNotNull();
    }
}
