package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.procurement.orchestration.ProcurementOrchestrator;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProcurementToolTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock
    private ProcurementOrchestrator procurementOrchestrator;

    @Mock
    private IPage<MaterialPurchase> page;

    @InjectMocks
    private ProcurementTool tool;

    // ─── list ────────────────────────────────────────────────────────────────

    @Test
    void list_noParams_returnsPagedResult() throws Exception {
        MaterialPurchase purchase = new MaterialPurchase();
        when(procurementOrchestrator.listPurchaseOrders(any())).thenReturn(page);
        when(page.getRecords()).thenReturn(List.of(purchase));
        when(page.getTotal()).thenReturn(1L);
        when(page.getCurrent()).thenReturn(1L);
        when(page.getPages()).thenReturn(1L);

        String result = tool.execute("{\"action\":\"list\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
        assertEquals(1, node.path("data").path("total").asLong());
    }

    @Test
    void list_withStatusFilter_passesParams() throws Exception {
        when(procurementOrchestrator.listPurchaseOrders(any())).thenReturn(page);
        when(page.getRecords()).thenReturn(List.of());
        when(page.getTotal()).thenReturn(0L);
        when(page.getCurrent()).thenReturn(1L);
        when(page.getPages()).thenReturn(0L);

        String result = tool.execute("{\"action\":\"list\",\"status\":\"PENDING\"}");
        assertTrue(JSON.readTree(result).path("ok").asBoolean());
        verify(procurementOrchestrator).listPurchaseOrders(argThat(m -> "PENDING".equals(m.get("status"))));
    }

    // ─── detail ──────────────────────────────────────────────────────────────

    @Test
    void detail_existingId_returnsDetail() throws Exception {
        MaterialPurchase purchase = new MaterialPurchase();
        purchase.setId("1001");
        when(procurementOrchestrator.getPurchaseOrderDetail("1001")).thenReturn(purchase);

        String result = tool.execute("{\"action\":\"detail\",\"id\":\"1001\"}");
        assertTrue(JSON.readTree(result).path("ok").asBoolean());
    }

    @Test
    void detail_notFound_returnsError() throws Exception {
        when(procurementOrchestrator.getPurchaseOrderDetail("9999"))
                .thenThrow(new IllegalStateException("采购单不存在"));

        String result = tool.execute("{\"action\":\"detail\",\"id\":\"9999\"}");
        assertFalse(JSON.readTree(result).path("ok").asBoolean());
    }

    @Test
    void detail_missingId_returnsError() throws Exception {
        String result = tool.execute("{\"action\":\"detail\"}");
        assertFalse(JSON.readTree(result).path("ok").asBoolean());
        verify(procurementOrchestrator, never()).getPurchaseOrderDetail(anyString());
    }

    // ─── stats ────────────────────────────────────────────────────────────────

    @Test
    void stats_returnsMap() throws Exception {
        Map<String, Object> statsResult = Map.of("totalOrders", 5, "pendingCount", 2);
        when(procurementOrchestrator.getStats(any())).thenReturn(statsResult);

        String result = tool.execute("{\"action\":\"stats\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
    }

    // ─── create ────────────────────────────────────────────────────────────────

    @Test
    void create_withRequiredFields_succeeds() throws Exception {
        when(procurementOrchestrator.createPurchaseOrder(any(MaterialPurchase.class))).thenReturn(true);

        String result = tool.execute("{\"action\":\"create\",\"materialName\":\"红色棉布\",\"purchaseQuantity\":\"200\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
    }

    @Test
    void create_orchestratorReturnsFalse_returnsError() throws Exception {
        when(procurementOrchestrator.createPurchaseOrder(any(MaterialPurchase.class)))
                .thenThrow(new IllegalStateException("创建采购单失败"));

        String result = tool.execute("{\"action\":\"create\",\"materialName\":\"蓝色涤纶\",\"purchaseQuantity\":\"100\"}");
        assertFalse(JSON.readTree(result).path("ok").asBoolean());
    }

    @Test
    void create_missingMaterialName_returnsError() throws Exception {
        String result = tool.execute("{\"action\":\"create\",\"purchaseQuantity\":\"50\"}");
        assertFalse(JSON.readTree(result).path("ok").asBoolean());
        verify(procurementOrchestrator, never()).createPurchaseOrder(any());
    }

    // ─── confirm_arrival ─────────────────────────────────────────────────────

    @Test
    void confirmArrival_withId_succeeds() throws Exception {
        Map<String, Object> arrivalResult = Map.of("status", "ARRIVED");
        when(procurementOrchestrator.confirmArrivalAndInbound(any())).thenReturn(arrivalResult);

        String result = tool.execute("{\"action\":\"confirm_arrival\",\"id\":\"PO2026001\",\"arrivedQuantity\":180}");
        assertTrue(JSON.readTree(result).path("ok").asBoolean());
    }

    @Test
    void confirmArrival_missingId_returnsError() throws Exception {
        String result = tool.execute("{\"action\":\"confirm_arrival\"}");
        assertFalse(JSON.readTree(result).path("ok").asBoolean());
        verify(procurementOrchestrator, never()).confirmArrivalAndInbound(any());
    }

    // ─── unknown action ───────────────────────────────────────────────────────

    @Test
    void unknownAction_returnsError() throws Exception {
        String result = tool.execute("{\"action\":\"approve\"}");
        JsonNode node = JSON.readTree(result);

        assertFalse(node.path("ok").asBoolean());
        assertTrue(node.path("message").asText().contains("不支持"));
    }
}
