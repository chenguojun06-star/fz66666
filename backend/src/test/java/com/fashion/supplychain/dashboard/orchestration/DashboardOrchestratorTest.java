package com.fashion.supplychain.dashboard.orchestration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.dashboard.dto.DashboardResponse;
import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class DashboardOrchestratorTest {

    @Mock
    private DashboardQueryService dashboardQueryService;

    @InjectMocks
    private DashboardOrchestrator dashboardOrchestrator;

    @Test
    void dashboard_returnsExpectedKeys() {
        when(dashboardQueryService.countEnabledStyles()).thenReturn(10L);
        when(dashboardQueryService.countProductionOrders()).thenReturn(20L);
        when(dashboardQueryService.countApprovedMaterialReconciliations()).thenReturn(5L);
        when(dashboardQueryService.countApprovedShipmentReconciliations()).thenReturn(6L);
        when(dashboardQueryService.countWarehousingBetween(any(), any())).thenReturn(8L);
        when(dashboardQueryService.sumUnqualifiedQuantityBetween(any(), any())).thenReturn(9L);
        when(dashboardQueryService.sumTotalOrderQuantity()).thenReturn(12L);
        when(dashboardQueryService.countOverdueOrders()).thenReturn(13L);
        when(dashboardQueryService.countTotalWarehousing()).thenReturn(14L);

        when(dashboardQueryService.listRecentStyles(5)).thenReturn(List.of());
        when(dashboardQueryService.listRecentOrders(5)).thenReturn(List.of());
        when(dashboardQueryService.listRecentScans(5)).thenReturn(List.of());
        when(dashboardQueryService.listRecentPurchases(5)).thenReturn(List.of());

        DashboardResponse data = dashboardOrchestrator.dashboard("2026-01-01", "2026-01-31", null, null);
        assertNotNull(data);

        // 使用新字段名
        assertEquals(10L, data.getSampleDevelopmentCount());  // styleCount -> sampleDevelopmentCount
        assertEquals(20L, data.getProductionOrderCount());     // productionCount -> productionOrderCount
        assertEquals(11L, data.getPaymentApprovalCount());    // paymentApprovalCount 保持不变
        assertEquals(8L, data.getTodayWarehousingCount());    // warehousingOrderCount -> todayWarehousingCount
        assertEquals(9L, data.getDefectiveQuantity());        // unqualifiedQuantity -> defectiveQuantity
        assertEquals(12L, data.getOrderQuantityTotal());
        assertEquals(13L, data.getOverdueOrderCount());
        assertEquals(14L, data.getTotalWarehousingCount());

        assertTrue(data.getRecentActivities() instanceof List);

        verify(dashboardQueryService).countEnabledStyles();
        verify(dashboardQueryService).countProductionOrders();
        verify(dashboardQueryService).countApprovedMaterialReconciliations();
        verify(dashboardQueryService).countApprovedShipmentReconciliations();
        verify(dashboardQueryService).countWarehousingBetween(any(), any());
        verify(dashboardQueryService).sumUnqualifiedQuantityBetween(any(), any());
        verify(dashboardQueryService).sumTotalOrderQuantity();
        verify(dashboardQueryService).countOverdueOrders();
        verify(dashboardQueryService).countTotalWarehousing();
    }
}
