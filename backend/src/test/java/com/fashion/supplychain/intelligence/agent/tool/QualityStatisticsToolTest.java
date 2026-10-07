package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.intelligence.agent.tracker.AiOperationAudit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * QualityStatisticsTool 单测。
 *
 * <p><b>D-760 更新</b>：本测试原先断言的是 {@code defectiveCount / defectiveRate / scrapRate}
 * 这套字段与「报废率」语义。但 {@code t_cutting_bundle} <b>根本没有 quality_status 列、也没有报废状态</b>，
 * 旧断言只是在 mock 上自洽 —— <b>mock 绕过了 SQL，所以列名错这件事当年测不出来</b>。
 *
 * <p>现在除字段名对齐真实语义外，还**捕获 QueryWrapper 直接断言 SQL 片段**：
 * 必须按真实列 {@code status} 过滤，且参数值只能是权威状态取值。
 * 这是运行时断言，比「读源码断言 contains」可靠得多。
 */
@ExtendWith(MockitoExtension.class)
class QualityStatisticsToolTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    /** 权威质检状态取值（与 ProductWarehousingHelper 常量一致） */
    private static final Set<String> AUTHORITATIVE_STATUS =
            Set.of("qualified", "unqualified", "repaired", "repaired_waiting_qc", "completed");

    /** 修复前误用、且在生产数据中不存在的状态值 */
    private static final Set<String> PHANTOM_STATUS =
            Set.of("REJECTED", "REPAIRING", "REPAIR_COMPLETED", "SCRAPPED");

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

    // ───────────────────────── 字段与语义 ─────────────────────────

    @Test
    void overview_returnsStats() throws Exception {
        // 调用顺序：total, qualified, unqualified, repaired, repairing
        when(cuttingBundleMapper.selectCount(any())).thenReturn(100L, 90L, 5L, 3L, 2L);

        String result = tool.execute("{\"action\":\"overview\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertEquals(100, node.path("totalBundles").asInt());
        assertEquals(90, node.path("qualifiedCount").asInt());
        assertEquals(5, node.path("unqualifiedCount").asInt());
        assertEquals(3, node.path("repairedCount").asInt());
        assertEquals(2, node.path("repairingCount").asInt());
        assertTrue(node.has("unqualifiedRate"));
        assertTrue(node.has("repairCompletionRate"));
        assertFalse(node.has("scrapRate"), "该表没有报废状态，不应再输出报废率");
    }

    @Test
    @DisplayName("D-760：零样本必须说「无法判断」，不得报「不合格率 0%」（铁律 9）")
    void overview_zeroOutput_saysNoDataNotHealthy() throws Exception {
        when(cuttingBundleMapper.selectCount(any())).thenReturn(0L, 0L, 0L, 0L, 0L);

        String result = tool.execute("{\"action\":\"overview\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertEquals(0, node.path("totalBundles").asInt());
        assertTrue(node.has("note"), "零样本时必须明确说明无法判断");
        assertTrue(node.path("note").asText().contains("无法判断"));
    }

    @Test
    void by_order_withOrderNo_returnsStats() throws Exception {
        // 调用顺序：total, unqualified, repaired, repairing
        when(cuttingBundleMapper.selectCount(any())).thenReturn(50L, 3L, 1L, 2L);

        String result = tool.execute("{\"action\":\"by_order\",\"orderNo\":\"ORD001\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertEquals("ORD001", node.path("orderNo").asText());
        assertEquals(50, node.path("totalBundles").asInt());
        assertEquals(3, node.path("unqualifiedCount").asInt());
    }

    @Test
    void by_factory_returnsItems() throws Exception {
        Map<String, Object> row = new HashMap<>();
        row.put("factory", "工厂A");
        row.put("total", 50L);
        row.put("unqualified", 3L);
        row.put("repaired", 1L);
        row.put("repairing", 2L);
        when(cuttingBundleMapper.selectMaps(any())).thenReturn(List.of(row));

        String result = tool.execute("{\"action\":\"by_factory\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertTrue(node.path("items").isArray());
    }

    @Test
    void by_reason_returnsItems() throws Exception {
        Map<String, Object> row = new HashMap<>();
        row.put("status", "unqualified");
        row.put("count", 5L);
        when(cuttingBundleMapper.selectMaps(any())).thenReturn(List.of(row));

        String result = tool.execute("{\"action\":\"by_reason\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertTrue(node.path("items").isArray());
    }

    @Test
    @DisplayName("D-760：trend 必须返回真实按天数据，不再是空实现")
    void trend_returnsRealItems() throws Exception {
        Map<String, Object> row = new HashMap<>();
        row.put("day", "2026-10-07");
        row.put("total", 12L);
        row.put("unqualified", 1L);
        when(cuttingBundleMapper.selectMaps(any())).thenReturn(List.of(row));

        String result = tool.execute("{\"action\":\"trend\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("success").asBoolean());
        assertTrue(node.path("items").isArray());
        assertEquals(1, node.path("items").size());
    }

    // ─────────────── D-760 核心：运行时断言真实 SQL 片段 ───────────────

    @Test
    @DisplayName("D-760：overview 必须按真实列 status 过滤，绝不查不存在的 quality_status")
    void overview_usesRealStatusColumn() throws Exception {
        when(cuttingBundleMapper.selectCount(any())).thenReturn(10L, 8L, 1L, 1L, 0L);

        tool.execute("{\"action\":\"overview\"}");

        ArgumentCaptor<QueryWrapper<CuttingBundle>> captor = captorOfWrappers();
        List<String> segments = captor.getAllValues().stream()
                .map(QueryWrapper::getSqlSegment).collect(Collectors.toList());

        for (String sql : segments) {
            assertFalse(sql.contains("quality_status"),
                    "不得查询 t_cutting_bundle 不存在的列 quality_status: " + sql);
            assertFalse(sql.contains("quality_remark"),
                    "不得查询 t_cutting_bundle 不存在的列 quality_remark: " + sql);
            assertTrue(sql.contains("tenant_id"), "必须带租户隔离: " + sql);
        }
        assertTrue(segments.stream().anyMatch(s -> s.contains("status")),
                "必须按真实列 status 过滤: " + segments);
    }

    @Test
    @DisplayName("D-760：状态参数值只能是权威取值，不得再用 REJECTED/REPAIRING/SCRAPPED")
    void overview_usesAuthoritativeStatusValues() throws Exception {
        when(cuttingBundleMapper.selectCount(any())).thenReturn(10L, 8L, 1L, 1L, 0L);

        tool.execute("{\"action\":\"overview\"}");

        // ⚠️ MyBatis-Plus 的 paramNameValuePairs 是**懒填充**的：
        // 必须先调 getSqlSegment() 触发生成，否则拿到的是空 Map。
        Set<String> usedValues = captorOfWrappers().getAllValues().stream()
                .peek(QueryWrapper::getSqlSegment)
                .flatMap(q -> q.getParamNameValuePairs().values().stream())
                .filter(v -> v instanceof String)
                .map(Object::toString)
                .collect(Collectors.toSet());

        assertFalse(usedValues.isEmpty(), "应至少传入一个状态值");
        assertTrue(Collections.disjoint(usedValues, PHANTOM_STATUS),
                "不得使用不存在的状态值 " + PHANTOM_STATUS + "，实际用了 " + usedValues);
        assertTrue(usedValues.stream().anyMatch(AUTHORITATIVE_STATUS::contains),
                "应使用权威状态取值之一，实际用了 " + usedValues);
    }

    @Test
    @DisplayName("D-760：by_order 必须按真实订单号列 production_order_no 过滤")
    void byOrder_usesRealOrderNoColumn() throws Exception {
        when(cuttingBundleMapper.selectCount(any())).thenReturn(1L, 0L, 0L, 0L);

        tool.execute("{\"action\":\"by_order\",\"orderNo\":\"ORD001\"}");

        List<String> segments = captorOfWrappers().getAllValues().stream()
                .map(QueryWrapper::getSqlSegment).collect(Collectors.toList());
        assertTrue(segments.stream().allMatch(s -> s.contains("production_order_no")),
                "必须用真实列 production_order_no: " + segments);
        // ⚠️ 必须用词边界：production_order_no 里**包含** order_no 这个子串，
        // 直接 contains("order_no") 会假红。下划线是 word 字符，故 \border_no\b 不会命中它。
        Pattern bareOrderNo = Pattern.compile("\\border_no\\b");
        assertTrue(segments.stream().noneMatch(s -> bareOrderNo.matcher(s).find()),
                "不得用不存在的列 order_no: " + segments);
    }

    // ───────────────────────── 边界 ─────────────────────────

    @Test
    void by_order_missingOrderNo_returnsError() throws Exception {
        String result = tool.execute("{\"action\":\"by_order\"}");
        JsonNode node = JSON.readTree(result);

        assertFalse(node.path("success").asBoolean());
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

    @SuppressWarnings("unchecked")
    private ArgumentCaptor<QueryWrapper<CuttingBundle>> captorOfWrappers() {
        ArgumentCaptor<QueryWrapper<CuttingBundle>> captor =
                ArgumentCaptor.forClass(QueryWrapper.class);
        verify(cuttingBundleMapper, atLeastOnce()).selectCount(captor.capture());
        return captor;
    }
}
