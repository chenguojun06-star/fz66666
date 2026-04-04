package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SecondaryProcessToolTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock
    private SecondaryProcessService secondaryProcessService;

    @InjectMocks
    private SecondaryProcessTool tool;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUserId("u2001");
        ctx.setUsername("测试操作员");
        ctx.setRole("operator");
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    // ── list ────────────────────────────────────────────────────────────────

    @Test
    void list_withoutStyleId_returnsAll() throws Exception {
        SecondaryProcess p = new SecondaryProcess();
        p.setId(10L);
        p.setProcessName("印花");
        when(secondaryProcessService.list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(List.of(p));

        String raw = tool.execute("{\"action\":\"list\"}");
        JsonNode root = JSON.readTree(raw);

        assertTrue(root.path("ok").asBoolean());
        assertEquals(1, root.path("data").path("total").asInt());
    }

    @Test
    void list_withStyleId_passesFilter() throws Exception {
        when(secondaryProcessService.list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class))).thenReturn(List.of());

        String raw = tool.execute("{\"action\":\"list\",\"styleId\":\"99\"}");
        JsonNode root = JSON.readTree(raw);

        assertTrue(root.path("ok").asBoolean());
        assertEquals(0, root.path("data").path("total").asInt());
        verify(secondaryProcessService).list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class));
    }

    // ── create ───────────────────────────────────────────────────────────────

    @Test
    void create_withRequiredFields_succeeds() throws Exception {
        when(secondaryProcessService.save(any())).thenReturn(true);

        String raw = tool.execute("{\"action\":\"create\",\"styleId\":\"5\","
                + "\"processType\":\"印花\",\"processName\":\"数码印花\"}");
        JsonNode root = JSON.readTree(raw);

        assertTrue(root.path("ok").asBoolean());
        assertTrue(root.path("message").asText().contains("创建成功"));
        verify(secondaryProcessService).save(any());
    }

    @Test
    void create_missingStyleId_returnsError() throws Exception {
        String raw = tool.execute("{\"action\":\"create\","
                + "\"processType\":\"印花\",\"processName\":\"数码印花\"}");
        JsonNode root = JSON.readTree(raw);

        assertFalse(root.path("ok").asBoolean());
        verify(secondaryProcessService, never()).save(any());
    }

    @Test
    void create_missingProcessType_returnsError() throws Exception {
        String raw = tool.execute("{\"action\":\"create\",\"styleId\":\"5\","
                + "\"processName\":\"数码印花\"}");
        JsonNode root = JSON.readTree(raw);

        assertFalse(root.path("ok").asBoolean());
        verify(secondaryProcessService, never()).save(any());
    }

    // ── update_status ─────────────────────────────────────────────────────────

    @Test
    void updateStatus_success() throws Exception {
        SecondaryProcess existing = new SecondaryProcess();
        existing.setId(20L);
        existing.setStatus("PENDING");
        when(secondaryProcessService.getById(any(String.class))).thenReturn(existing);
        when(secondaryProcessService.updateById(any())).thenReturn(true);

        String raw = tool.execute("{\"action\":\"update_status\",\"processId\":\"20\",\"status\":\"IN_PROGRESS\"}");
        JsonNode root = JSON.readTree(raw);

        assertTrue(root.path("ok").asBoolean());
        verify(secondaryProcessService).updateById(any());
    }

    @Test
    void updateStatus_invalidStatus_returnsError() throws Exception {
        String raw = tool.execute("{\"action\":\"update_status\",\"processId\":\"20\",\"status\":\"INVALID\"}");
        JsonNode root = JSON.readTree(raw);

        assertFalse(root.path("ok").asBoolean());
        verify(secondaryProcessService, never()).updateById(any());
    }

    @Test
    void updateStatus_notFound_returnsError() throws Exception {
        when(secondaryProcessService.getById(any(String.class))).thenReturn(null);

        String raw = tool.execute("{\"action\":\"update_status\",\"processId\":\"999\",\"status\":\"COMPLETED\"}");
        JsonNode root = JSON.readTree(raw);

        assertFalse(root.path("ok").asBoolean());
    }

    // ── unknown action ────────────────────────────────────────────────────────

    @Test
    void unknownAction_returnsError() throws Exception {
        String raw = tool.execute("{\"action\":\"delete\"}");
        JsonNode root = JSON.readTree(raw);

        assertFalse(root.path("ok").asBoolean());
        assertTrue(root.path("message").asText().contains("不支持"));
    }
}
