package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.mapper.MaterialStockMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.mapper.ProductSkuMapper;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.intelligence.agent.tracker.AiOperationAudit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class InventorySummaryToolTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock
    private MaterialStockMapper materialStockMapper;

    @Mock
    private ProductSkuMapper productSkuMapper;

    @Mock
    private AiAgentToolAccessService accessService;

    @Mock
    private AiOperationAudit operationAudit;

    private InventorySummaryTool tool;

    @BeforeEach
    void setUp() {
        tool = new InventorySummaryTool();
        ReflectionTestUtils.setField(tool, "materialStockMapper", materialStockMapper);
        ReflectionTestUtils.setField(tool, "productSkuMapper", productSkuMapper);
        ReflectionTestUtils.setField(tool, "accessService", accessService);
        ReflectionTestUtils.setField(tool, "operationAudit", operationAudit);
        lenient().when(accessService.canUseTool(any())).thenReturn(true);

        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUserId("u-inv-1");
        ctx.setUsername("库存管理员");
        ctx.setTenantOwner(true);
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void summary_returnsMaterialAndFinished() throws Exception {
        Map<String, Object> matRow = new HashMap<>();
        matRow.put("totalTypes", 5L);
        matRow.put("totalQuantity", 1000);
        matRow.put("totalLocked", 200);
        matRow.put("totalValue", new BigDecimal("50000"));
        when(materialStockMapper.selectMaps(any())).thenReturn(List.of(matRow));

        Map<String, Object> finRow = new HashMap<>();
        finRow.put("totalSkus", 10L);
        finRow.put("totalQuantity", 500);
        finRow.put("totalValue", new BigDecimal("80000"));
        when(productSkuMapper.selectMaps(any())).thenReturn(List.of(finRow));

        String result = tool.execute("{\"action\":\"summary\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertTrue(node.has("materialStock"));
        assertTrue(node.has("finishedStock"));
        assertTrue(node.has("grandTotalValue"));
    }

    @Test
    void summary_emptyData_returnsZero() throws Exception {
        when(materialStockMapper.selectMaps(any())).thenReturn(Collections.emptyList());
        when(productSkuMapper.selectMaps(any())).thenReturn(Collections.emptyList());

        String result = tool.execute("{\"action\":\"summary\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
    }

    @Test
    void material_by_type_returnsItems() throws Exception {
        Map<String, Object> row = new HashMap<>();
        row.put("type", "面料");
        row.put("typeCount", 3L);
        row.put("totalQuantity", 500);
        row.put("totalValue", new BigDecimal("30000"));
        when(materialStockMapper.selectMaps(any())).thenReturn(List.of(row));

        String result = tool.execute("{\"action\":\"material_by_type\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertTrue(node.path("items").isArray());
        assertEquals("面料", node.path("items").get(0).path("type").asText());
    }

    @Test
    void finished_by_style_returnsItems() throws Exception {
        Map<String, Object> row = new HashMap<>();
        row.put("styleNo", "S001");
        row.put("skuCount", 2L);
        row.put("totalQuantity", 100);
        row.put("totalValue", new BigDecimal("20000"));
        when(productSkuMapper.selectMaps(any())).thenReturn(List.of(row));

        String result = tool.execute("{\"action\":\"finished_by_style\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertTrue(node.path("items").isArray());
    }

    @Test
    void alert_returnsLowStockItems() throws Exception {
        Map<String, Object> row = new HashMap<>();
        row.put("name", "白色面料");
        row.put("type", "面料");
        row.put("quantity", 5);
        row.put("availableQuantity", 3);
        when(materialStockMapper.selectMaps(any())).thenReturn(List.of(row));

        String result = tool.execute("{\"action\":\"alert\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertEquals(1, node.path("alertCount").asInt());
    }

    @Test
    void unknownAction_returnsError() throws Exception {
        String result = tool.execute("{\"action\":\"invalid\"}");
        JsonNode node = JSON.readTree(result);

        assertFalse(node.path("success").asBoolean());
    }

    @Test
    void getName_returnsExpected() {
        assertEquals("tool_inventory_summary", tool.getName());
    }

    @Test
    void getToolDefinition_hasRequiredAction() {
        var def = tool.getToolDefinition();
        assertNotNull(def);
        assertNotNull(def.getFunction());
        assertEquals("tool_inventory_summary", def.getFunction().getName());
        assertTrue(def.getFunction().getParameters().getRequired().contains("action"));
    }
}
