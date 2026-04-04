package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.production.orchestration.PatternProductionOrchestrator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PatternProductionToolTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock
    private PatternProductionOrchestrator patternProductionOrchestrator;

    @InjectMocks
    private PatternProductionTool tool;

    // ─── list ────────────────────────────────────────────────────────────────

    @Test
    void list_noParams_returnsData() throws Exception {
        Map<String, Object> mockResult = Map.of("records", java.util.List.of(), "total", 0);
        when(patternProductionOrchestrator.listWithEnrichment(
                anyInt(), anyInt(), isNull(), isNull(), isNull(), isNull()
        )).thenReturn(mockResult);

        String result = tool.execute("{\"action\":\"list\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
    }

    @Test
    void list_withStatusFilter_passesParam() throws Exception {
        Map<String, Object> mockResult = Map.of("records", java.util.List.of(), "total", 0);
        when(patternProductionOrchestrator.listWithEnrichment(
                anyInt(), anyInt(), isNull(), eq("PENDING"), isNull(), isNull()
        )).thenReturn(mockResult);

        String result = tool.execute("{\"action\":\"list\",\"status\":\"PENDING\"}");
        assertTrue(JSON.readTree(result).path("ok").asBoolean());
    }

    // ─── receive ─────────────────────────────────────────────────────────────

    @Test
    void receive_withPatternId_callsOrchestrator() throws Exception {
        when(patternProductionOrchestrator.receivePattern(eq("10"), any())).thenReturn("已收样");

        String result = tool.execute("{\"action\":\"receive\",\"patternId\":10}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
        assertEquals("已收样", node.path("data").path("message").asText());
    }

    @Test
    void receive_orchestratorReturnsNull_fallsBackToDefault() throws Exception {
        when(patternProductionOrchestrator.receivePattern(eq("11"), any())).thenReturn(null);

        String result = tool.execute("{\"action\":\"receive\",\"patternId\":11}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
        assertEquals("收样已确认", node.path("data").path("message").asText());
    }

    @Test
    void receive_missingPatternId_returnsError() throws Exception {
        String result = tool.execute("{\"action\":\"receive\"}");
        assertFalse(JSON.readTree(result).path("ok").asBoolean());
        verify(patternProductionOrchestrator, never()).receivePattern(anyString(), any());
    }

    // ─── review ──────────────────────────────────────────────────────────────

    @Test
    void review_passResult_succeeds() throws Exception {
        Map<String, Object> reviewResult = Map.of("id", 12L, "status", "PASSED");
        when(patternProductionOrchestrator.reviewPattern("12", "PASS", null)).thenReturn(reviewResult);

        String result = tool.execute("{\"action\":\"review\",\"patternId\":12,\"result\":\"PASS\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
    }

    @Test
    void review_invalidResult_returnsError() throws Exception {
        String result = tool.execute("{\"action\":\"review\",\"patternId\":13,\"result\":\"MAYBE\"}");
        assertFalse(JSON.readTree(result).path("ok").asBoolean());
        verify(patternProductionOrchestrator, never()).reviewPattern(anyString(), anyString(), any());
    }

    @Test
    void review_missingResult_returnsError() throws Exception {
        String result = tool.execute("{\"action\":\"review\",\"patternId\":14}");
        assertFalse(JSON.readTree(result).path("ok").asBoolean());
    }

    // ─── warehouse_in ─────────────────────────────────────────────────────────

    @Test
    void warehouseIn_withPatternId_succeeds() throws Exception {
        Map<String, Object> warehouseResult = Map.of("id", 15L, "status", "WAREHOUSED");
        when(patternProductionOrchestrator.warehouseIn("15", null)).thenReturn(warehouseResult);

        String result = tool.execute("{\"action\":\"warehouse_in\",\"patternId\":15}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
        assertTrue(node.path("message").asText().contains("入库"));
    }

    @Test
    void warehouseIn_missingPatternId_returnsError() throws Exception {
        String result = tool.execute("{\"action\":\"warehouse_in\"}");
        assertFalse(JSON.readTree(result).path("ok").asBoolean());
        verify(patternProductionOrchestrator, never()).warehouseIn(anyString(), any());
    }

    // ─── unknown action ───────────────────────────────────────────────────────

    @Test
    void unknownAction_returnsError() throws Exception {
        String result = tool.execute("{\"action\":\"delete\"}");
        JsonNode node = JSON.readTree(result);

        assertFalse(node.path("ok").asBoolean());
        assertTrue(node.path("message").asText().contains("不支持"));
    }
}
