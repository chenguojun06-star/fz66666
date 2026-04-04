package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.service.MaterialPickingService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MaterialPickingToolTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock
    private MaterialPickingService materialPickingService;

    @InjectMocks
    private MaterialPickingTool tool;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUserId("u3001");
        ctx.setUsername("测试操作员");
        ctx.setRole("operator");
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    // ─── list ────────────────────────────────────────────────────────────────

    @Test
    void list_withoutOrderNo_returnsAll() throws Exception {
        MaterialPicking p = new MaterialPicking();
        p.setId("1");
        p.setPickingNo("LP2026001");
        when(materialPickingService.list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(List.of(p));

        String result = tool.execute("{\"action\":\"list\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
        assertEquals(1, node.path("data").path("total").asInt());
    }

    @Test
    void list_withOrderNo_passesFilter() throws Exception {
        when(materialPickingService.list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(List.of());

        String result = tool.execute("{\"action\":\"list\",\"orderNo\":\"PO2026001\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
        assertEquals(0, node.path("data").path("total").asInt());
    }

    // ─── get_items ────────────────────────────────────────────────────────────

    @Test
    void getItems_returnsItems() throws Exception {
        MaterialPickingItem item = new MaterialPickingItem();
        item.setId("10");
        item.setMaterialName("棉布");
        when(materialPickingService.getItemsByPickingId("5")).thenReturn(List.of(item));

        String result = tool.execute("{\"action\":\"get_items\",\"pickingId\":5}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
        assertEquals(1, node.path("data").path("itemCount").asInt());
    }

    @Test
    void getItems_missingPickingId_returnsError() throws Exception {
        String result = tool.execute("{\"action\":\"get_items\"}");
        JsonNode node = JSON.readTree(result);

        assertFalse(node.path("ok").asBoolean());
        verify(materialPickingService, never()).getItemsByPickingId(any());
    }

    // ─── create ───────────────────────────────────────────────────────────────

    @Test
    void create_withRequiredFields_succeeds() throws Exception {
        when(materialPickingService.createPicking(any(), any())).thenReturn("LP2026002");

        String result = tool.execute("{\"action\":\"create\",\"materialName\":\"涤纶\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
        assertEquals("LP2026002", node.path("data").path("pickingNo").asText());
    }

    @Test
    void create_withQuantity_buildsItem() throws Exception {
        when(materialPickingService.createPicking(any(), any())).thenReturn("LP2026003");

        String result = tool.execute(
                "{\"action\":\"create\",\"materialName\":\"棉纱\",\"quantity\":100,\"unit\":\"kg\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
        verify(materialPickingService).createPicking(any(), argThat(items -> !items.isEmpty()));
    }

    @Test
    void create_missingMaterialName_returnsError() throws Exception {
        String result = tool.execute("{\"action\":\"create\"}");
        JsonNode node = JSON.readTree(result);

        assertFalse(node.path("ok").asBoolean());
        verify(materialPickingService, never()).createPicking(any(), any());
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
