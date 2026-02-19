package com.fashion.supplychain.datacenter.orchestration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.datacenter.service.DataCenterQueryService;
import com.fashion.supplychain.style.entity.StyleInfo;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class DataCenterOrchestratorTest {

    @Mock
    private DataCenterQueryService dataCenterQueryService;

    @InjectMocks
    private DataCenterOrchestrator dataCenterOrchestrator;

    @Test
    void stats_returnsExpectedCounts() {
        when(dataCenterQueryService.countEnabledStyles()).thenReturn(1L);
        when(dataCenterQueryService.countMaterialPurchases()).thenReturn(2L);
        when(dataCenterQueryService.countProductionOrders()).thenReturn(3L);

        Map<String, Object> data = dataCenterOrchestrator.stats();
        assertNotNull(data);
        assertEquals(1L, data.get("styleCount"));
        assertEquals(2L, data.get("materialCount"));
        assertEquals(3L, data.get("productionCount"));
    }

    @Test
    void productionSheet_returnsFailWhenStyleMissing() {
        when(dataCenterQueryService.findStyle(null, "S001")).thenReturn(null);
        NoSuchElementException ex = assertThrows(NoSuchElementException.class,
                () -> dataCenterOrchestrator.productionSheet("S001", null));
        assertEquals("款号不存在", ex.getMessage());
    }

    @Test
    void productionSheet_returnsDataWhenStyleExists() {
        StyleInfo style = new StyleInfo();
        style.setId(100L);
        style.setStyleNo("S001");
        when(dataCenterQueryService.findStyle(100L, null)).thenReturn(style);
        when(dataCenterQueryService.listBom(100L)).thenReturn(List.of());
        when(dataCenterQueryService.listSize(100L)).thenReturn(List.of());
        when(dataCenterQueryService.listAttachments(100L)).thenReturn(List.of());

        Map<String, Object> data = dataCenterOrchestrator.productionSheet(null, 100L);
        assertNotNull(data);
        assertNotNull(data.get("style"));
    }
}
