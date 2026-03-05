package com.fashion.supplychain.production.orchestration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.CuttingTask;
import java.util.HashMap;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Answers;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.stubbing.Answer;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * CuttingTaskOrchestrator 单元测试
 *
 * <p>重点验证 2026-02-26 修复的 NULL BUG：
 * createCustom() 中 task.productionOrderId 和 bundle.productionOrderId 必须被赋值（不为 null）。
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("CuttingTaskOrchestrator 单元测试")
class CuttingTaskOrchestratorTest {

    @Mock
    private CuttingTaskService cuttingTaskService;

    @Mock
    private StyleInfoService styleInfoService;

    @Mock
    private CuttingBundleService cuttingBundleService;

    @Mock
    private ProductionOrderService productionOrderService;

    @InjectMocks
    private CuttingTaskOrchestrator orchestrator;

    /** lambdaQuery 链式 Mock：RETURNS_SELF 使 .eq()/.last() 回传自身 */
    @SuppressWarnings("unchecked")
    private final LambdaQueryChainWrapper<StyleInfo> styleQuery =
            (LambdaQueryChainWrapper<StyleInfo>) Mockito.mock(
                    LambdaQueryChainWrapper.class, Answers.RETURNS_SELF);

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setUserId("operator1");
        ctx.setUsername("操作员");
        ctx.setTenantId(1L);
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @BeforeAll
    static void initMybatisPlusLambdaCache() {
        org.apache.ibatis.builder.MapperBuilderAssistant ass =
                new org.apache.ibatis.builder.MapperBuilderAssistant(
                        new com.baomidou.mybatisplus.core.MybatisConfiguration(), "");
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(ass, ProductionOrder.class);
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(ass, CuttingTask.class);
    }

    // ─────────────────────────────────────────────────────────
    // getStatusStats
    // ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("getStatusStats - 无订单时各状态均返回 0")
    void getStatusStats_noOrders_returnsAllZeros() {
        when(productionOrderService.list(Mockito.<Wrapper<ProductionOrder>>any())).thenReturn(Collections.emptyList());

        Map<String, Object> stats = orchestrator.getStatusStats(Map.of());

        assertNotNull(stats);
        assertEquals(0L, getCount(stats, "pendingCount"));
        assertEquals(0L, getCount(stats, "receivedCount"));
        assertEquals(0L, getCount(stats, "bundledCount"));
    }

    @Test
    @DisplayName("getStatusStats - 正确统计各状态数量")
    void getStatusStats_withOrders_countsCorrectly() {
        ProductionOrder o1 = buildOrder("ord-1");
        ProductionOrder o2 = buildOrder("ord-2");
        when(productionOrderService.list(Mockito.<Wrapper<ProductionOrder>>any())).thenReturn(List.of(o1, o2));

        CuttingTask pending1 = buildTask("t1", "pending");
        CuttingTask pending2 = buildTask("t2", "pending");
        CuttingTask received1 = buildTask("t3", "received");
        CuttingTask bundled1 = buildTask("t4", "bundled");
        when(cuttingTaskService.list(Mockito.<Wrapper<CuttingTask>>any())).thenReturn(
                List.of(pending1, pending2, received1, bundled1));

        Map<String, Object> stats = orchestrator.getStatusStats(Map.of());

        assertEquals(2L, getCount(stats, "pendingCount"));
        assertEquals(1L, getCount(stats, "receivedCount"));
        assertEquals(1L, getCount(stats, "bundledCount"));
    }

    // ─────────────────────────────────────────────────────────
    // createCustom - 参数校验
    // ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("createCustom - 缺少款号抛 IllegalArgumentException")
    void createCustom_missingStyleNo_throws() {
        Map<String, Object> body = new HashMap<>();
        body.put("styleNo", "");
        assertThrows(IllegalArgumentException.class, () -> orchestrator.createCustom(body));
    }

    @Test
    @DisplayName("createCustom - 菲号列表为空抛 IllegalArgumentException")
    void createCustom_emptyBundles_throws() {
        Map<String, Object> body = new HashMap<>();
        body.put("styleNo", "STY-001");
        body.put("bundles", Collections.emptyList());
        assertThrows(IllegalArgumentException.class, () -> orchestrator.createCustom(body));
    }

    @Test
    @DisplayName("createCustom - 款式不存在抛 IllegalArgumentException")
    void createCustom_styleNotFound_throws() {
        when(styleInfoService.lambdaQuery()).thenReturn(styleQuery);
        doReturn(null).when(styleQuery).one();
        assertThrows(NoSuchElementException.class, () ->
                orchestrator.createCustom(buildValidCreateBody()));
    }

    // ─────────────────────────────────────────────────────────
    // createCustom - 核心 BUG 修复验证
    // ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("createCustom - task.productionOrderId 必须被赋值（BUG FIX #1）")
    void createCustom_success_taskProductionOrderIdNotNull() {
        StyleInfo style = buildStyle("STY-001");
        when(styleInfoService.lambdaQuery()).thenReturn(styleQuery);
        doReturn(style).when(styleQuery).one();
        when(cuttingTaskService.getOne(any())).thenReturn(null);

        // 模拟 productionOrderService.save 并捕获保存的订单
        final String[] savedOrderId = {null};
        doAnswer((Answer<Boolean>) inv -> {
            ProductionOrder o = inv.getArgument(0);
            o.setId("new-order-id"); // 模拟 MyBatis-Plus 回写 id
            savedOrderId[0] = o.getId();
            return true;
        }).when(productionOrderService).save(any(ProductionOrder.class));

        // 捕获保存的 CuttingTask
        ArgumentCaptor<CuttingTask> taskCaptor = ArgumentCaptor.forClass(CuttingTask.class);
        doReturn(true).when(cuttingTaskService).save(taskCaptor.capture());

        doReturn(true).when(cuttingBundleService).saveBatch(any());

        orchestrator.createCustom(buildValidCreateBody());

        CuttingTask savedTask = taskCaptor.getValue();
        assertNotNull(savedTask.getProductionOrderId(),
                "❌ BUG: task.productionOrderId 不应为 null（2026-02-26 Bug Fix）");
        assertEquals("new-order-id", savedTask.getProductionOrderId());
    }

    @Test
    @DisplayName("createCustom - bundle.productionOrderId 必须被赋值（BUG FIX #2）")
    void createCustom_success_bundleProductionOrderIdNotNull() {
        StyleInfo style = buildStyle("STY-001");
        when(styleInfoService.lambdaQuery()).thenReturn(styleQuery);
        doReturn(style).when(styleQuery).one();
        when(cuttingTaskService.getOne(any())).thenReturn(null);

        doAnswer((Answer<Boolean>) inv -> {
            ProductionOrder o = inv.getArgument(0);
            o.setId("new-order-id-2");
            return true;
        }).when(productionOrderService).save(any(ProductionOrder.class));

        doReturn(true).when(cuttingTaskService).save(any());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<CuttingBundle>> bundleCaptor =
                ArgumentCaptor.forClass(List.class);
        doReturn(true).when(cuttingBundleService).saveBatch(bundleCaptor.capture());

        orchestrator.createCustom(buildValidCreateBody());

        List<CuttingBundle> bundles = bundleCaptor.getValue();
        assertFalse(bundles.isEmpty(), "至少应有一个菲号");
        for (CuttingBundle b : bundles) {
            assertNotNull(b.getProductionOrderId(),
                    "❌ BUG: bundle.productionOrderId 不应为 null（2026-02-26 Bug Fix）");
        }
    }

    @Test
    @DisplayName("createCustom - factoryName 赋空串避免 MySql STRICT 500")
    void createCustom_factoryName_isEmptyStringNotNull() {
        StyleInfo style = buildStyle("STY-001");
        when(styleInfoService.lambdaQuery()).thenReturn(styleQuery);
        doReturn(style).when(styleQuery).one();
        when(cuttingTaskService.getOne(any())).thenReturn(null);

        ArgumentCaptor<ProductionOrder> orderCaptor =
                ArgumentCaptor.forClass(ProductionOrder.class);
        doAnswer((Answer<Boolean>) inv -> {
            ProductionOrder o = inv.getArgument(0);
            o.setId("order-id-3");
            return true;
        }).when(productionOrderService).save(orderCaptor.capture());
        doReturn(true).when(cuttingTaskService).save(any());
        doReturn(true).when(cuttingBundleService).saveBatch(any());

        orchestrator.createCustom(buildValidCreateBody());

        ProductionOrder savedOrder = orderCaptor.getValue();
        assertNotNull(savedOrder.getFactoryName(),
                "factoryName 不允许为 null，应赋空串 \"\"");
        assertEquals("", savedOrder.getFactoryName());
    }

    // ─────────────────────────────────────────────────────────
    // receive
    // ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("receive - 任务不存在抛异常")
    void receive_taskNotFound_throws() {
        Map<String, Object> body = new HashMap<>();
        body.put("taskId", "nonexistent");
        body.put("receiverId", "worker1");
        body.put("receiverName", "张三");
        when(cuttingTaskService.getById("nonexistent")).thenReturn(null);
        assertThrows(NoSuchElementException.class, () -> orchestrator.receive(body));
    }

    @Test
    @DisplayName("receive - 正常领取更新 receiverId 字段")
    void receive_success_updatesReceiver() {
        Map<String, Object> body = new HashMap<>();
        body.put("taskId", "task-1");
        body.put("receiverId", "worker1");
        body.put("receiverName", "张三");

        CuttingTask task = new CuttingTask();
        task.setId("task-1");
        task.setStatus("pending");
        task.setTenantId(1L); // TenantAssert 需要与 UserContext.tenantId() 一致

        CuttingTask updatedTask = new CuttingTask();
        updatedTask.setId("task-1");
        updatedTask.setReceiverId("worker1");
        updatedTask.setReceiverName("张三");
        updatedTask.setStatus("received");
        updatedTask.setTenantId(1L);

        when(cuttingTaskService.getById("task-1"))
                .thenReturn(task)
                .thenReturn(updatedTask);
        when(cuttingTaskService.receiveTask("task-1", "worker1", "张三")).thenReturn(true);

        CuttingTask result = orchestrator.receive(body);

        assertNotNull(result);
        assertEquals("worker1", result.getReceiverId());
        verify(cuttingTaskService).receiveTask("task-1", "worker1", "张三");
    }

    // ─────────────────────────────────────────────────────────
    // 辅助方法
    // ─────────────────────────────────────────────────────────

    private Map<String, Object> buildValidCreateBody() {
        Map<String, Object> body = new HashMap<>();
        body.put("styleNo", "STY-001");
        Map<String, Object> bundle = new HashMap<>();
        bundle.put("bundleNo", "B-001");
        bundle.put("quantity", 50);
        bundle.put("color", "红色");
        bundle.put("size", "XL");
        body.put("bundles", List.of(bundle));
        return body;
    }

    private ProductionOrder buildOrder(String id) {
        ProductionOrder o = new ProductionOrder();
        o.setId(id);
        o.setTenantId(1L);
        return o;
    }

    private CuttingTask buildTask(String id, String status) {
        CuttingTask t = new CuttingTask();
        t.setId(id);
        t.setStatus(status);
        return t;
    }

    private StyleInfo buildStyle(String styleNo) {
        StyleInfo s = new StyleInfo();
        s.setId(1L);
        s.setStyleNo(styleNo);
        s.setStyleName("测试款式");
        s.setTenantId(1L);
        return s;
    }

    private long getCount(Map<String, Object> stats, String key) {
        Object val = stats.get(key);
        if (val == null) return 0L;
        if (val instanceof Number) return ((Number) val).longValue();
        return 0L;
    }
}
