package com.fashion.supplychain.dashboard.orchestration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import java.util.List;
import java.util.Map;
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
        when(dashboardQueryService.countPendingFactoryReconciliations()).thenReturn(1L);
        when(dashboardQueryService.countPendingMaterialReconciliations()).thenReturn(2L);
        when(dashboardQueryService.countPendingShipmentReconciliations()).thenReturn(3L);
        when(dashboardQueryService.countApprovedFactoryReconciliations()).thenReturn(4L);
        when(dashboardQueryService.countApprovedMaterialReconciliations()).thenReturn(5L);
        when(dashboardQueryService.countApprovedShipmentReconciliations()).thenReturn(6L);
        when(dashboardQueryService.countScansBetween(any(), any())).thenReturn(7L);
        when(dashboardQueryService.countWarehousingBetween(any(), any())).thenReturn(8L);
        when(dashboardQueryService.sumUnqualifiedQuantityBetween(any(), any())).thenReturn(9L);
        when(dashboardQueryService.countUrgentEvents()).thenReturn(11L);

        when(dashboardQueryService.listRecentStyles(5)).thenReturn(List.of());
        when(dashboardQueryService.listRecentOrders(5)).thenReturn(List.of());
        when(dashboardQueryService.listRecentFactoryReconciliations(5)).thenReturn(List.of());
        when(dashboardQueryService.listRecentScans(5)).thenReturn(List.of());
        when(dashboardQueryService.listRecentPurchases(5)).thenReturn(List.of());

        Map<String, Object> data = dashboardOrchestrator.dashboard("2026-01-01", "2026-01-31", null, null);
        assertNotNull(data);

        assertEquals(10L, data.get("styleCount"));
        assertEquals(20L, data.get("productionCount"));
        assertEquals(6L, data.get("pendingReconciliationCount"));
        assertEquals(15L, data.get("paymentApprovalCount"));
        assertEquals(7L, data.get("todayScanCount"));
        assertEquals(8L, data.get("warehousingOrderCount"));
        assertEquals(9L, data.get("unqualifiedQuantity"));
        assertEquals(11L, data.get("urgentEventCount"));

        Object recent = data.get("recentActivities");
        assertTrue(recent instanceof List);

        verify(dashboardQueryService).countEnabledStyles();
        verify(dashboardQueryService).countProductionOrders();
        verify(dashboardQueryService).countPendingFactoryReconciliations();
        verify(dashboardQueryService).countPendingMaterialReconciliations();
        verify(dashboardQueryService).countPendingShipmentReconciliations();
        verify(dashboardQueryService).countApprovedFactoryReconciliations();
        verify(dashboardQueryService).countApprovedMaterialReconciliations();
        verify(dashboardQueryService).countApprovedShipmentReconciliations();
        verify(dashboardQueryService).countScansBetween(any(), any());
        verify(dashboardQueryService).countWarehousingBetween(any(), any());
        verify(dashboardQueryService).sumUnqualifiedQuantityBetween(any(), any());
        verify(dashboardQueryService).countUrgentEvents();
    }
}
