package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.intelligence.agent.tracker.AiOperationAudit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class QualityStatisticsToolTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock
    private CuttingBundleMapper cuttingBundleMapper;

    @Mock
    private AiAgentToolAccessService accessService;

    @Mock
    private AiOperationAudit operationAudit;

    private QualityStatisticsTool tool;

    @BeforeEach
    void setUp() {
        tool = new QualityStatisticsTool();
        ReflectionTestUtils.setField(tool, "cuttingBundleMapper", cuttingBundleMapper);
        ReflectionTestUtils.setField(tool, "accessService", accessService);
        ReflectionTestUtils.setField(tool, "operationAudit", operationAudit);
        lenient().when(accessService.canUseTool(any())).thenReturn(true);

        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUserId("u-qual-1");
        ctx.setUsername("质检管理员");
        ctx.setTenantOwner(true);
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void overview_returnsStats() throws Exception {
        when(cuttingBundleMapper.selectCount(any())).thenReturn(100L, 5L, 2L, 3L, 2L);

        String result = tool.execute("{\"action\":\"overview\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertEquals(100, node.path("totalOutput").asInt());
        assertEquals(5, node.path("defectiveCount").asInt());
        assertTrue(node.has("defectiveRate"));
        assertTrue(node.has("scrapRate"));
        assertTrue(node.has("repairCompletionRate"));
    }

    @Test
    void overview_zeroOutput_returnsZeroRates() throws Exception {
        when(cuttingBundleMapper.selectCount(any())).thenReturn(0L, 0L, 0L, 0L, 0L);

        String result = tool.execute("{\"action\":\"overview\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertEquals("0.00%", node.path("defectiveRate").asText());
    }

    @Test
    void by_factory_returnsItems() throws Exception {
        Map<String, Object> row = new HashMap<>();
        row.put("factory", "工厂A");
        row.put("total", 50L);
        row.put("defective", 3L);
        row.put("scrapped", 1L);
        when(cuttingBundleMapper.selectMaps(any())).thenReturn(List.of(row));

        String result = tool.execute("{\"action\":\"by_factory\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertTrue(node.path("items").isArray());
    }

    @Test
    void by_order_missingOrderNo_returnsError() throws Exception {
        String result = tool.execute("{\"action\":\"by_order\"}");
        JsonNode node = JSON.readTree(result);

        assertFalse(node.path("success").asBoolean());
    }

    @Test
    void by_order_withOrderNo_returnsStats() throws Exception {
        when(cuttingBundleMapper.selectCount(any())).thenReturn(50L, 3L, 1L, 2L);

        String result = tool.execute("{\"action\":\"by_order\",\"orderNo\":\"ORD001\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertEquals("ORD001", node.path("orderNo").asText());
        assertEquals(50, node.path("total").asInt());
    }

    @Test
    void by_reason_returnsItems() throws Exception {
        Map<String, Object> row = new HashMap<>();
        row.put("reason", "色差");
        row.put("count", 5L);
        when(cuttingBundleMapper.selectMaps(any())).thenReturn(List.of(row));

        String result = tool.execute("{\"action\":\"by_reason\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertTrue(node.path("items").isArray());
    }

    @Test
    void trend_returnsNote() throws Exception {
        String result = tool.execute("{\"action\":\"trend\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertTrue(node.has("note"));
    }

    @Test
    void unknownAction_returnsError() throws Exception {
        String result = tool.execute("{\"action\":\"invalid\"}");
        JsonNode node = JSON.readTree(result);

        assertFalse(node.path("success").asBoolean());
    }

    @Test
    void getName_returnsExpected() {
        assertEquals("tool_quality_statistics", tool.getName());
    }

    @Test
    void getToolDefinition_hasRequiredAction() {
        var def = tool.getToolDefinition();
        assertNotNull(def);
        assertTrue(def.getFunction().getParameters().getRequired().contains("action"));
    }
}
