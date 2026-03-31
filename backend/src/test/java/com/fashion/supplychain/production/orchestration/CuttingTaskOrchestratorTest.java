package com.fashion.supplychain.production.orchestration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.system.entity.OrganizationUnit;
import com.fashion.supplychain.system.helper.OrganizationUnitBindingHelper;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.OrganizationUnitService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
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
import org.springframework.security.access.AccessDeniedException;

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

    @Mock
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Mock
    private TemplateLibraryService templateLibraryService;

    @Mock
    private FactoryService factoryService;

    @Mock
    private OrganizationUnitService organizationUnitService;

    @Mock
    private OrganizationUnitBindingHelper organizationUnitBindingHelper;

    @Mock
    private ObjectMapper objectMapper;

    @Mock
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    @InjectMocks
    private CuttingTaskOrchestrator orchestrator;

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
        try {
            lenient().when(objectMapper.writeValueAsString(any())).thenReturn("[{\"color\":\"黑色\",\"size\":\"XL\",\"quantity\":120},{\"color\":\"白色\",\"size\":\"L\",\"quantity\":50}]");
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        OrganizationUnit internalUnit = new OrganizationUnit();
        internalUnit.setId("org-1");
        internalUnit.setNodeName("一组车间");
        internalUnit.setNodeType("DEPARTMENT");
        internalUnit.setPathNames("生产中心/一组车间");
        lenient().when(organizationUnitService.getById("org-1")).thenReturn(internalUnit);
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
        TableInfoHelper.initTableInfo(ass, ProductionOrder.class);
        TableInfoHelper.initTableInfo(ass, CuttingTask.class);
    }

    @Test
    @DisplayName("getStatusStats - 无订单时各状态均返回 0")
    void getStatusStats_noOrders_returnsAllZeros() {
        when(cuttingTaskService.list(Mockito.<Wrapper<CuttingTask>>any())).thenReturn(Collections.emptyList());

        Map<String, Object> stats = orchestrator.getStatusStats(Map.of());

        assertNotNull(stats);
        assertEquals(0L, getCount(stats, "pendingCount"));
        assertEquals(0L, getCount(stats, "receivedCount"));
        assertEquals(0L, getCount(stats, "bundledCount"));
    }

    @Test
    @DisplayName("getStatusStats - 正确统计各状态数量")
    void getStatusStats_withOrders_countsCorrectly() {
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

    @Test
    @DisplayName("createCustom - 缺少款号抛 IllegalArgumentException")
    void createCustom_missingStyleNo_throws() {
        Map<String, Object> body = new HashMap<>();
        body.put("styleNo", "");
        assertThrows(IllegalArgumentException.class, () -> orchestrator.createCustom(body));
    }

    @Test
    @DisplayName("createCustom - 无主数据款号也创建正常待领取起点")
    void createCustom_withoutStyleInfo_createsNormalPendingStart() {
        when(styleInfoService.lambdaQuery()).thenReturn(styleQuery);
        doReturn(null).when(styleQuery).one();
        when(cuttingTaskService.getOne(any())).thenReturn(null);
        when(templateLibraryService.resolveProgressNodeUnitPrices("TPL-001")).thenReturn(Collections.emptyList());

        ArgumentCaptor<ProductionOrder> orderCaptor = ArgumentCaptor.forClass(ProductionOrder.class);
        doAnswer((Answer<Boolean>) inv -> {
            ProductionOrder order = inv.getArgument(0);
            order.setId("order-1");
            return true;
        }).when(productionOrderService).save(orderCaptor.capture());

        CuttingTask createdTask = new CuttingTask();
        createdTask.setId("task-1");
        createdTask.setProductionOrderId("order-1");
        createdTask.setProductionOrderNo("CUT-ORDER-001");
        createdTask.setStatus("pending");
        when(cuttingTaskService.createTaskIfAbsent(any(ProductionOrder.class))).thenReturn(createdTask);

        CuttingTask result = orchestrator.createCustom(buildSingleLineCreateBody("TPL-001", "CUT-ORDER-001"));

        ProductionOrder savedOrder = orderCaptor.getValue();
        assertNotNull(result);
        assertEquals("task-1", result.getId());
        assertEquals("pending", result.getStatus());
        assertEquals("CUT-ORDER-001", savedOrder.getOrderNo());
        assertEquals("CUT-ORDER-001", savedOrder.getQrCode());
        assertEquals("TPL-001", savedOrder.getStyleNo());
        assertEquals("TPL-001", savedOrder.getStyleName());
        assertEquals("TPL-001", savedOrder.getStyleId());
        assertEquals("黑色", savedOrder.getColor());
        assertEquals("XL", savedOrder.getSize());
        assertEquals("pending", savedOrder.getStatus());
        assertEquals(120, savedOrder.getOrderQuantity());
        assertEquals(LocalDateTime.of(2026, 3, 15, 0, 0), savedOrder.getCreateTime());
        assertEquals(LocalDateTime.of(2026, 3, 25, 23, 59, 59), savedOrder.getPlannedEndDate());
        assertNotNull(savedOrder.getOrderDetails());
        assertTrue(savedOrder.getOrderDetails().contains("黑色"));
        assertTrue(savedOrder.getOrderDetails().contains("XL"));
        assertTrue(savedOrder.getOrderDetails().contains("120"));
        assertEquals(0, savedOrder.getCompletedQuantity());
        assertEquals(0, savedOrder.getProductionProgress());
        assertEquals(100, savedOrder.getMaterialArrivalRate());
        assertEquals("一组车间", savedOrder.getFactoryName());
        assertNull(savedOrder.getProgressWorkflowJson());

        verify(cuttingTaskService).createTaskIfAbsent(any(ProductionOrder.class));
        verify(scanRecordDomainService).ensureBaseStageScanRecordsOnCreate(savedOrder);
        verify(productionOrderService).recomputeProgressFromRecords("order-1");
        verify(cuttingBundleService, never()).saveBatch(any());
        verify(cuttingTaskService, never()).save(any(CuttingTask.class));
    }

    @Test
    @DisplayName("createCustom - 模板工序单价会写入正常订单 workflow JSON")
    void createCustom_writesWorkflowJsonFromTemplateNodes() {
        StyleInfo style = buildStyle("STY-001");
        style.setColor("红色");
        style.setSize("XL");
        when(styleInfoService.lambdaQuery()).thenReturn(styleQuery);
        doReturn(style).when(styleQuery).one();
        when(cuttingTaskService.getOne(any())).thenReturn(null);
        when(templateLibraryService.resolveProgressNodeUnitPrices("STY-001")).thenReturn(List.of(
                Map.of(
                        "id", "SEWING",
                        "name", "车缝",
                        "progressStage", "车缝",
                        "unitPrice", new BigDecimal("3.25"))));

        ArgumentCaptor<ProductionOrder> orderCaptor = ArgumentCaptor.forClass(ProductionOrder.class);
        doAnswer((Answer<Boolean>) inv -> {
            ProductionOrder order = inv.getArgument(0);
            order.setId("order-2");
            return true;
        }).when(productionOrderService).save(orderCaptor.capture());

        CuttingTask createdTask = new CuttingTask();
        createdTask.setId("task-2");
        createdTask.setProductionOrderId("order-2");
        createdTask.setStatus("pending");
        when(cuttingTaskService.createTaskIfAbsent(any(ProductionOrder.class))).thenReturn(createdTask);

        orchestrator.createCustom(buildSingleLineCreateBody("STY-001", "CUT-ORDER-002"));

        ProductionOrder savedOrder = orderCaptor.getValue();
        assertEquals(1L, savedOrder.getTenantId());
        assertEquals("operator1", savedOrder.getCreatedById());
        assertEquals("操作员", savedOrder.getCreatedByName());
        assertEquals("黑色", savedOrder.getColor());
        assertEquals("XL", savedOrder.getSize());
        assertNotNull(savedOrder.getProgressWorkflowJson());
        assertTrue(savedOrder.getProgressWorkflowJson().contains("车缝"));
        assertTrue(savedOrder.getProgressWorkflowJson().contains("SEWING"));
        assertTrue(savedOrder.getProgressWorkflowJson().contains("3.25"));
    }

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
    @DisplayName("receive - CUT直下裁剪单不校验采购也可领取")
    void receive_directCuttingOrder_skipsProcurementGate() {
        Map<String, Object> body = new HashMap<>();
        body.put("taskId", "task-1");
        body.put("receiverId", "worker1");
        body.put("receiverName", "张三");

        CuttingTask task = new CuttingTask();
        task.setId("task-1");
        task.setStatus("pending");
        task.setTenantId(1L);
        task.setProductionOrderId("order-1");

        ProductionOrder order = new ProductionOrder();
        order.setId("order-1");
        order.setOrderNo("CUT-ORDER-001");
        order.setMaterialArrivalRate(0);

        CuttingTask updatedTask = new CuttingTask();
        updatedTask.setId("task-1");
        updatedTask.setReceiverId("worker1");
        updatedTask.setReceiverName("张三");
        updatedTask.setStatus("received");
        updatedTask.setTenantId(1L);

        when(cuttingTaskService.getById("task-1"))
                .thenReturn(task)
                .thenReturn(updatedTask);
        when(productionOrderService.getById("order-1")).thenReturn(order);
        when(cuttingTaskService.receiveTask("task-1", "worker1", "张三")).thenReturn(true);

        CuttingTask result = orchestrator.receive(body);

        assertNotNull(result);
        assertEquals("worker1", result.getReceiverId());
        verify(cuttingTaskService).receiveTask("task-1", "worker1", "张三");
    }

    @Test
    @DisplayName("rollback - 缺少原因时抛 IllegalArgumentException")
    void rollback_missingReason_throws() {
        Map<String, Object> body = new HashMap<>();
        body.put("taskId", "task-1");

        assertThrows(IllegalArgumentException.class, () -> orchestrator.rollback(body));
    }

    @Test
    @DisplayName("rollback - 裁剪已完成并生成菲号时不允许退回")
    void rollback_bundledTask_throwsIllegalState() {
        Map<String, Object> body = new HashMap<>();
        body.put("taskId", "task-1");
        body.put("reason", "重新分配");

        CuttingTask current = new CuttingTask();
        current.setId("task-1");
        current.setTenantId(1L);
        current.setStatus("bundled");
        current.setProductionOrderId("order-1");
        current.setProductionOrderNo("CUT-ORDER-001");

        when(cuttingTaskService.getById("task-1")).thenReturn(current);

        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> orchestrator.rollback(body));

        assertEquals("裁剪已完成并生成菲号，不允许退回", ex.getMessage());
        verify(cuttingTaskService, never()).rollbackTask("task-1");
        verify(cuttingTaskService, never()).insertRollbackLog(any(), any(), any(), any());
        verify(productionOrderService, never()).updateById(any(ProductionOrder.class));
    }

    @Test
    @DisplayName("rollback - 未登录时拒绝操作")
    void rollback_withoutLogin_throwsAccessDenied() {
        UserContext.clear();
        Map<String, Object> body = new HashMap<>();
        body.put("taskId", "task-1");
        body.put("reason", "重新分配");

        assertThrows(AccessDeniedException.class, () -> orchestrator.rollback(body));
    }

    private Map<String, Object> buildCreateBody(String styleNo, String orderNo) {
        Map<String, Object> body = new HashMap<>();
        body.put("styleNo", styleNo);
        body.put("orderNo", orderNo);
        body.put("factoryType", "INTERNAL");
        body.put("orgUnitId", "org-1");
        body.put("orderDate", "2026-03-15");
        body.put("deliveryDate", "2026-03-25");
        body.put("orderLines", List.of(
                Map.of("color", "黑色", "size", "XL", "quantity", 120),
                Map.of("color", "白色", "size", "L", "quantity", 50)));
        return body;
    }

    private Map<String, Object> buildSingleLineCreateBody(String styleNo, String orderNo) {
        Map<String, Object> body = new HashMap<>();
        body.put("styleNo", styleNo);
        body.put("orderNo", orderNo);
        body.put("factoryType", "INTERNAL");
        body.put("orgUnitId", "org-1");
        body.put("orderDate", "2026-03-15");
        body.put("deliveryDate", "2026-03-25");
        body.put("orderLines", List.of(
                Map.of("color", "黑色", "size", "XL", "quantity", 120)));
        return body;
    }

    private ProductionOrder buildOrder(String id) {
        ProductionOrder order = new ProductionOrder();
        order.setId(id);
        order.setTenantId(1L);
        return order;
    }

    private CuttingTask buildTask(String id, String status) {
        CuttingTask task = new CuttingTask();
        task.setId(id);
        task.setStatus(status);
        return task;
    }

    private StyleInfo buildStyle(String styleNo) {
        StyleInfo style = new StyleInfo();
        style.setId(1L);
        style.setStyleNo(styleNo);
        style.setStyleName("测试款式");
        style.setTenantId(1L);
        style.setStatus("ENABLED");
        return style;
    }

    private long getCount(Map<String, Object> stats, String key) {
        Object val = stats.get(key);
        if (val == null) {
            return 0L;
        }
        if (val instanceof Number) {
            return ((Number) val).longValue();
        }
        return 0L;
    }
}
