package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
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
import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UnitPriceQueryToolTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock
    private ProductionOrderMapper productionOrderMapper;

    @Mock
    private StyleInfoMapper styleInfoMapper;

    @Mock
    private AiAgentToolAccessService accessService;

    @Mock
    private AiOperationAudit operationAudit;

    private UnitPriceQueryTool tool;

    private void setupTool() {
        tool = new UnitPriceQueryTool();
        ReflectionTestUtils.setField(tool, "productionOrderMapper", productionOrderMapper);
        ReflectionTestUtils.setField(tool, "styleInfoMapper", styleInfoMapper);
        ReflectionTestUtils.setField(tool, "accessService", accessService);
        ReflectionTestUtils.setField(tool, "operationAudit", operationAudit);
        lenient().when(accessService.canUseTool(any())).thenReturn(true);
    }

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUserId("u-price-1");
        ctx.setUsername("财务管理员");
        ctx.setTenantOwner(true);
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void by_style_withOrders_returnsPriceInfo() throws Exception {
        setupTool();
        StyleInfo style = new StyleInfo();
        style.setStyleName("T恤A");
        style.setCategory("上衣");
        when(styleInfoMapper.selectOne(any())).thenReturn(style);

        ProductionOrder order = new ProductionOrder();
        order.setOrderNo("ORD001");
        order.setFactoryName("工厂A");
        order.setFactoryUnitPrice(new BigDecimal("35.00"));
        order.setQuotationUnitPrice(new BigDecimal("50.00"));
        order.setOrderQuantity(200);
        order.setStatus("IN_PRODUCTION");
        order.setCreateTime(LocalDateTime.now());
        when(productionOrderMapper.selectList(any())).thenReturn(List.of(order));

        String result = tool.execute("{\"action\":\"by_style\",\"styleNo\":\"S001\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertEquals("T恤A", node.path("styleName").asText());
        assertEquals(1, node.path("orderCount").asInt());
        assertTrue(node.has("latestPrice"));
    }

    @Test
    void by_style_noOrders_returnsNote() throws Exception {
        setupTool();
        when(styleInfoMapper.selectOne(any())).thenReturn(null);
        when(productionOrderMapper.selectList(any())).thenReturn(Collections.emptyList());

        String result = tool.execute("{\"action\":\"by_style\",\"styleNo\":\"S999\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertEquals(0, node.path("orderCount").asInt());
        assertTrue(node.has("note"));
    }

    @Test
    void by_style_withFactoryFilter_passesFilter() throws Exception {
        setupTool();
        when(styleInfoMapper.selectOne(any())).thenReturn(null);
        when(productionOrderMapper.selectList(any())).thenReturn(Collections.emptyList());

        String result = tool.execute("{\"action\":\"by_style\",\"styleNo\":\"S001\",\"factoryName\":\"工厂A\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        verify(productionOrderMapper).selectList(any());
    }

    @Test
    void compare_returnsFactoryComparison() throws Exception {
        setupTool();
        Map<String, Object> row = new HashMap<>();
        row.put("factory", "工厂A");
        row.put("orderCount", 3L);
        row.put("avgPrice", new BigDecimal("35.00"));
        row.put("minPrice", new BigDecimal("30.00"));
        row.put("maxPrice", new BigDecimal("40.00"));
        when(productionOrderMapper.selectMaps(any())).thenReturn(List.of(row));

        String result = tool.execute("{\"action\":\"compare\",\"styleNo\":\"S001\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertTrue(node.path("factoryComparison").isArray());
        assertEquals("工厂A", node.path("cheapestFactory").asText());
    }

    @Test
    void history_returnsPriceHistory() throws Exception {
        setupTool();
        ProductionOrder order = new ProductionOrder();
        order.setOrderNo("ORD001");
        order.setFactoryName("工厂A");
        order.setFactoryUnitPrice(new BigDecimal("35.00"));
        order.setOrderQuantity(200);
        order.setCreateTime(LocalDateTime.now());
        when(productionOrderMapper.selectList(any())).thenReturn(List.of(order));

        String result = tool.execute("{\"action\":\"history\",\"styleNo\":\"S001\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertTrue(node.path("history").isArray());
    }

    @Test
    void missingStyleNo_returnsError() throws Exception {
        setupTool();
        String result = tool.execute("{\"action\":\"by_style\"}");
        JsonNode node = JSON.readTree(result);

        assertFalse(node.path("success").asBoolean());
    }

    @Test
    void unknownAction_returnsError() throws Exception {
        setupTool();
        String result = tool.execute("{\"action\":\"invalid\",\"styleNo\":\"S001\"}");
        JsonNode node = JSON.readTree(result);

        assertFalse(node.path("success").asBoolean());
    }

    @Test
    void getName_returnsExpected() {
        setupTool();
        assertEquals("tool_unit_price_query", tool.getName());
    }

    @Test
    void getToolDefinition_hasRequiredParams() {
        setupTool();
        var def = tool.getToolDefinition();
        assertNotNull(def);
        var required = def.getFunction().getParameters().getRequired();
        assertTrue(required.contains("action"));
        assertTrue(required.contains("styleNo"));
    }
}
