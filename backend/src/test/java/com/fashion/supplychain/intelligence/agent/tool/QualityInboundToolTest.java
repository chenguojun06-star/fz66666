package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.IntelligenceAuditLog;
import com.fashion.supplychain.intelligence.mapper.IntelligenceAuditLogMapper;
import com.fashion.supplychain.production.orchestration.ProductWarehousingOrchestrator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * QualityInboundTool 单元测试
 * 覆盖：安全门禁 / 参数校验 / query_pending / submit 成功与失败路径
 */
@ExtendWith(MockitoExtension.class)
class QualityInboundToolTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock
    private ProductWarehousingOrchestrator warehousingOrchestrator;

    @Mock
    private IntelligenceAuditLogMapper auditLogMapper;

    @InjectMocks
    private QualityInboundTool tool;

    // ── 环境准备 ──────────────────────────────────────────────────────────────

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = buildNormalContext();
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    /** 内部账号（无 factoryId）+ 角色 */
    private UserContext buildNormalContext() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUserId("u2001");
        ctx.setUsername("质检员小张");
        // role 字段通过 setRole 设置（如果无则用 setRoleName 或其他方式）
        ctx.setRole("quality_inspector");
        return ctx;
    }

    // ── 1. 安全门禁：外发工厂账号拦截 ─────────────────────────────────────────

    @Test
    void execute_blocksFactoryAccount() throws Exception {
        UserContext.clear();
        UserContext factoryCtx = new UserContext();
        factoryCtx.setTenantId(1L);
        factoryCtx.setUserId("f001");
        factoryCtx.setUsername("外发工人");
        factoryCtx.setRole("factory_worker");
        factoryCtx.setFactoryId("FAC-001"); // 外发工厂，应被拦截
        UserContext.set(factoryCtx);

        String result = tool.execute("{\"action\":\"submit\",\"orderNo\":\"PO001\",\"qualifiedQuantity\":100}");

        JsonNode node = JSON.readTree(result);
        assertFalse(node.has("success"), "外发工厂账号不应有 success 字段");
        assertTrue(node.path("error").asText().contains("外发工厂账号"), "应提示外发工厂无权限");
        verifyNoInteractions(warehousingOrchestrator);
    }

    // ── 2. 安全门禁：角色缺失拦截 ────────────────────────────────────────────

    @Test
    void execute_blocksWhenRoleIsBlank() throws Exception {
        UserContext.clear();
        UserContext noRoleCtx = new UserContext();
        noRoleCtx.setTenantId(1L);
        noRoleCtx.setUserId("u9999");
        noRoleCtx.setUsername("无角色用户");
        // role 为 null
        UserContext.set(noRoleCtx);

        String result = tool.execute("{\"action\":\"submit\",\"orderNo\":\"PO001\",\"qualifiedQuantity\":100}");

        JsonNode node = JSON.readTree(result);
        assertTrue(node.has("error"), "角色缺失应返回 error");
        assertTrue(node.path("error").asText().contains("角色"), "错误提示应包含'角色'");
        verifyNoInteractions(warehousingOrchestrator);
    }

    // ── 3. 缺少 action 参数 ───────────────────────────────────────────────────

    @Test
    void execute_returnsError_whenActionMissing() throws Exception {
        String result = tool.execute("{\"orderNo\":\"PO001\"}");

        JsonNode node = JSON.readTree(result);
        assertTrue(node.has("error"));
        assertTrue(node.path("error").asText().contains("action"));
    }

    // ── 4. query_pending：返回空列表 ─────────────────────────────────────────

    @Test
    void execute_queryPending_returnsZeroCount_whenNoPendingBundles() throws Exception {
        when(warehousingOrchestrator.listPendingBundles("pending_warehouse"))
                .thenReturn(new ArrayList<>());

        String result = tool.execute("{\"action\":\"query_pending\"}");

        JsonNode node = JSON.readTree(result);
        assertEquals(0, node.path("pendingCount").asInt(), "空列表 pendingCount 应为 0");
        assertTrue(node.path("message").asText().contains("没有待入库"), "空列表提示应正确");
    }

    // ── 5. query_pending：有待入库菲号 ────────────────────────────────────────

    @Test
    void execute_queryPending_returnsItems_whenBundlesExist() throws Exception {
        List<Map<String, Object>> pendingList = List.of(
                buildBundle("B001", "PO20260315001"),
                buildBundle("B002", "PO20260315001")
        );
        when(warehousingOrchestrator.listPendingBundles("pending_warehouse")).thenReturn(pendingList);

        String result = tool.execute("{\"action\":\"query_pending\"}");

        JsonNode node = JSON.readTree(result);
        assertEquals(2, node.path("pendingCount").asInt());
        assertTrue(node.has("items"));
        assertEquals(2, node.path("items").size());
        assertTrue(node.path("message").asText().contains("2 个菲号待入库"));
    }

    // ── 6. query_pending：按订单ID筛选 ───────────────────────────────────────

    @Test
    void execute_queryPending_filtersById() throws Exception {
        Map<String, Object> b1 = buildBundle("B001", "PO001");
        b1.put("orderId", "ORDER-100");
        Map<String, Object> b2 = buildBundle("B002", "PO002");
        b2.put("orderId", "ORDER-200");

        when(warehousingOrchestrator.listPendingBundles("pending_warehouse"))
                .thenReturn(List.of(b1, b2));

        String result = tool.execute("{\"action\":\"query_pending\",\"orderId\":\"ORDER-100\"}");

        JsonNode node = JSON.readTree(result);
        assertEquals(1, node.path("pendingCount").asInt(), "按订单ID筛选后应只有1条");
    }

    // ── 7. submit：缺少 orderNo ──────────────────────────────────────────────

    @Test
    void execute_submit_returnsError_whenOrderNoMissing() throws Exception {
        String result = tool.execute("{\"action\":\"submit\",\"qualifiedQuantity\":100}");

        JsonNode node = JSON.readTree(result);
        assertTrue(node.has("error"));
        assertTrue(node.path("error").asText().contains("orderNo"), "应提示缺少 orderNo");
        verifyNoInteractions(warehousingOrchestrator);
    }

    // ── 8. submit：qualifiedQuantity 为 0（必须大于0）────────────────────────

    @Test
    void execute_submit_returnsError_whenQualifiedQuantityIsZero() throws Exception {
        String result = tool.execute("{\"action\":\"submit\",\"orderNo\":\"PO001\",\"qualifiedQuantity\":0}");

        JsonNode node = JSON.readTree(result);
        assertTrue(node.has("error"));
        assertTrue(node.path("error").asText().contains("qualifiedQuantity"), "应提示合格数量参数问题");
        verifyNoInteractions(warehousingOrchestrator);
    }

    // ── 9. submit：qualifiedQuantity 未传（null）──────────────────────────────

    @Test
    void execute_submit_returnsError_whenQualifiedQuantityAbsent() throws Exception {
        String result = tool.execute("{\"action\":\"submit\",\"orderNo\":\"PO001\"}");

        JsonNode node = JSON.readTree(result);
        assertTrue(node.has("error"));
    }

    // ── 10. submit：完整参数，入库成功 ───────────────────────────────────────

    @Test
    void execute_submit_succeeds_withAllFields() throws Exception {
        when(warehousingOrchestrator.save(any())).thenReturn(true);

        String args = """
                {
                  "action": "submit",
                  "orderNo": "PO20260315001",
                  "qualifiedQuantity": 200,
                  "unqualifiedQuantity": 5,
                  "cuttingBundleQrCode": "QR-ABC123",
                  "warehouse": "A区1号货架",
                  "defectCategory": "针眼",
                  "defectRemark": "袖口部分针眼2处"
                }
                """;

        String result = tool.execute(args);

        JsonNode node = JSON.readTree(result);
        assertTrue(node.path("success").asBoolean(), "入库成功时 success 应为 true");
        assertEquals("PO20260315001", node.path("orderNo").asText());
        assertEquals(200, node.path("qualifiedQuantity").asInt());
        assertEquals(5, node.path("unqualifiedQuantity").asInt());
        assertTrue(node.path("message").asText().contains("入库成功"), "成功消息应包含'入库成功'");
        assertTrue(node.path("message").asText().contains("次品"), "有次品时消息应提及次品");

        // 验证 save() 被调用，且入库实体字段正确
        ArgumentCaptor<com.fashion.supplychain.production.entity.ProductWarehousing> captor =
                ArgumentCaptor.forClass(com.fashion.supplychain.production.entity.ProductWarehousing.class);
        verify(warehousingOrchestrator).save(captor.capture());
        var saved = captor.getValue();
        assertEquals("PO20260315001", saved.getOrderNo());
        assertEquals(200, saved.getQualifiedQuantity());
        assertEquals(5, saved.getUnqualifiedQuantity());
        assertEquals(200, saved.getWarehousingQuantity(), "warehousingQuantity 应等于 qualifiedQuantity");
        assertEquals("normal", saved.getWarehousingType());
        assertEquals("partial", saved.getQualityStatus(), "有次品时状态应为 partial");
        assertEquals("QR-ABC123", saved.getCuttingBundleQrCode());
        assertEquals("A区1号货架", saved.getWarehouse());
        assertEquals("针眼", saved.getDefectCategory());
    }

    // ── 11. submit：无次品，qualityStatus 应为 passed ────────────────────────

    @Test
    void execute_submit_setsQualityStatusPassed_whenNoDefects() throws Exception {
        when(warehousingOrchestrator.save(any())).thenReturn(true);

        String result = tool.execute(
                "{\"action\":\"submit\",\"orderNo\":\"PO001\",\"qualifiedQuantity\":100}");

        JsonNode node = JSON.readTree(result);
        assertTrue(node.path("success").asBoolean());
        assertEquals(0, node.path("unqualifiedQuantity").asInt());

        ArgumentCaptor<com.fashion.supplychain.production.entity.ProductWarehousing> captor =
                ArgumentCaptor.forClass(com.fashion.supplychain.production.entity.ProductWarehousing.class);
        verify(warehousingOrchestrator).save(captor.capture());
        assertEquals("passed", captor.getValue().getQualityStatus());
    }

    // ── 12. submit：Orchestrator 返回 false ── 入库失败 ───────────────────────

    @Test
    void execute_submit_returnsError_whenOrchestratorReturnsFalse() throws Exception {
        when(warehousingOrchestrator.save(any())).thenReturn(false);

        String result = tool.execute(
                "{\"action\":\"submit\",\"orderNo\":\"PO001\",\"qualifiedQuantity\":50}");

        JsonNode node = JSON.readTree(result);
        assertFalse(node.has("success"), "失败时不应有 success 字段");
        assertTrue(node.has("error"), "失败时应有 error 字段");
        // 审计日志依然写入（FAILED）
        verify(auditLogMapper).insert(any(IntelligenceAuditLog.class));
    }

    // ── 13. submit：业务异常（IllegalArgumentException）────────────────────

    @Test
    void execute_submit_returnsBusinessError_whenIllegalArgument() throws Exception {
        when(warehousingOrchestrator.save(any()))
                .thenThrow(new IllegalArgumentException("订单状态不允许入库"));

        String result = tool.execute(
                "{\"action\":\"submit\",\"orderNo\":\"PO001\",\"qualifiedQuantity\":50}");

        JsonNode node = JSON.readTree(result);
        assertTrue(node.has("error"));
        assertTrue(node.path("error").asText().contains("订单状态不允许入库"),
                "业务异常信息应直接透传给用户");
        verify(auditLogMapper).insert(any(IntelligenceAuditLog.class)); // 审计日志应记录 FAILED
    }

    // ── 14. submit：系统异常（通用 Exception）────────────────────────────────

    @Test
    void execute_submit_returnsSystemError_whenUnexpectedException() throws Exception {
        when(warehousingOrchestrator.save(any()))
                .thenThrow(new RuntimeException("数据库连接超时"));

        String result = tool.execute(
                "{\"action\":\"submit\",\"orderNo\":\"PO001\",\"qualifiedQuantity\":50}");

        JsonNode node = JSON.readTree(result);
        assertTrue(node.has("error"));
        assertTrue(node.path("error").asText().startsWith("入库操作失败"),
                "系统异常应包装为通用错误提示");
        verify(auditLogMapper).insert(any(IntelligenceAuditLog.class));
    }

    // ── 15. submit：审计日志写入失败不影响业务正常返回 ──────────────────────

    @Test
    void execute_submit_succeedsEvenIfAuditLogFails() throws Exception {
        when(warehousingOrchestrator.save(any())).thenReturn(true);
        doThrow(new RuntimeException("DB满了")).when(auditLogMapper).insert(any(IntelligenceAuditLog.class));

        String result = tool.execute(
                "{\"action\":\"submit\",\"orderNo\":\"PO001\",\"qualifiedQuantity\":50}");

        JsonNode node = JSON.readTree(result);
        // 审计日志内部有 catch，不应让业务失败
        assertTrue(node.path("success").asBoolean(), "审计日志异常不应影响业务结果");
    }

    // ── 16. 不支持的 action ──────────────────────────────────────────────────

    @Test
    void execute_returnsError_forUnknownAction() throws Exception {
        String result = tool.execute("{\"action\":\"delete_all\"}");

        JsonNode node = JSON.readTree(result);
        assertTrue(node.has("error"));
        assertTrue(node.path("error").asText().contains("不支持"), "应提示不支持该 action");
    }

    // ── 17. getName() 工具名称校验 ───────────────────────────────────────────

    @Test
    void getName_returnsExpectedToolName() {
        assertEquals("tool_quality_inbound", tool.getName());
    }

    // ── 18. getToolDefinition() 结构完整性校验 ──────────────────────────────

    @Test
    void getToolDefinition_hasCorrectStructure() {
        var def = tool.getToolDefinition();
        assertNotNull(def);
        assertNotNull(def.getFunction());
        assertEquals("tool_quality_inbound", def.getFunction().getName());
        assertTrue(def.getFunction().getDescription().contains("入库"),
                "工具描述应包含'入库'");
        var params = def.getFunction().getParameters();
        assertNotNull(params);
        assertTrue(params.getRequired().contains("action"), "action 应为必填参数");
        assertTrue(params.getProperties().containsKey("orderNo"));
        assertTrue(params.getProperties().containsKey("qualifiedQuantity"));
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private Map<String, Object> buildBundle(String bundleId, String orderNo) {
        Map<String, Object> bundle = new HashMap<>();
        bundle.put("bundleId", bundleId);
        bundle.put("orderNo", orderNo);
        bundle.put("quantity", 50);
        bundle.put("status", "pending_warehouse");
        return bundle;
    }
}
