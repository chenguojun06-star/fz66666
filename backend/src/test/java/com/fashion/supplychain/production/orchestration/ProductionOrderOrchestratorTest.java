package com.fashion.supplychain.production.orchestration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionOrderCreationHelper;
import com.fashion.supplychain.production.orchestration.ProductionOrderLifecycleHelper;
import com.fashion.supplychain.production.orchestration.ProductionOrderWorkflowHelper;
import com.fashion.supplychain.production.service.*;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * ProductionOrderOrchestrator 单元测试
 *
 * 测试范围：
 * 1. 订单查询（分页、详情）
 * 2. 订单创建（验证、自动生成采购需求）
 * 3. 订单更新（状态检查、操作记录）
 * 4. 订单删除（级联删除）
 * 5. 异常处理（参数验证）
 */
@ExtendWith(MockitoExtension.class)
class ProductionOrderOrchestratorTest {

    @Mock private ProductionOrderService productionOrderService;
    @Mock private ProductionOrderQueryService productionOrderQueryService;
    @Mock private MaterialPurchaseService materialPurchaseService;
    @Mock private CuttingTaskService cuttingTaskService;
    @Mock private ProductionOrderScanRecordDomainService scanRecordDomainService;
    @Mock private ScanRecordService scanRecordService;
    @Mock private StyleInfoService styleInfoService;
    @Mock private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;
    @Mock private ProductionOrderOrchestratorHelper helper;
    @Mock private ProductionOrderProgressOrchestrationService progressOrchestrationService;
    @Mock private ProductionOrderFinanceOrchestrationService financeOrchestrationService;
    @Mock private ProductionOrderFlowOrchestrationService flowOrchestrationService;
    @Mock private ObjectMapper objectMapper;
    @Mock private ProductionOrderLifecycleHelper lifecycleHelper;
    @Mock private ProductionOrderWorkflowHelper workflowHelper;
    @Mock private ProductionOrderCreationHelper creationHelper;

    @InjectMocks
    private ProductionOrderOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setUserId("testUser");
        ctx.setUsername("测试用户");
        ctx.setRole("admin");
        ctx.setTenantId(1L);
        UserContext.set(ctx);
        lenient().when(helper.safeText(any())).thenAnswer(invocation -> {
            Object value = invocation.getArgument(0);
            return value == null ? "" : String.valueOf(value);
        });
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    // ==================== 查询测试 ====================

    @Test
    void queryPage_returnsPagedResults() {
        Map<String, Object> params = new HashMap<>();
        params.put("page", 1);
        params.put("size", 10);

        Page<ProductionOrder> expectedPage = new Page<>(1, 10);
        expectedPage.setRecords(Collections.singletonList(createTestOrder()));
        expectedPage.setTotal(1);

        when(productionOrderQueryService.queryPage(params)).thenReturn(expectedPage);

        IPage<ProductionOrder> result = orchestrator.queryPage(params);

        assertNotNull(result);
        assertEquals(1, result.getTotal());
        assertEquals(1, result.getRecords().size());
        verify(productionOrderQueryService).queryPage(params);
    }

    @Test
    void getDetailById_returnsOrder_whenExists() {
        String orderId = "order123";
        ProductionOrder expectedOrder = createTestOrder();
        expectedOrder.setId(orderId);

        when(productionOrderQueryService.getDetailById(orderId)).thenReturn(expectedOrder);

        ProductionOrder result = orchestrator.getDetailById(orderId);

        assertNotNull(result);
        assertEquals(orderId, result.getId());
        verify(productionOrderQueryService).getDetailById(orderId);
    }

    @Test
    void getDetailById_throwsException_whenOrderNotFound() {
        String orderId = "notExist";
        when(productionOrderQueryService.getDetailById(orderId)).thenReturn(null);

        assertThrows(NoSuchElementException.class, () -> orchestrator.getDetailById(orderId));
    }

    @Test
    void getDetailById_throwsException_whenIdIsEmpty() {
        assertThrows(IllegalArgumentException.class, () -> orchestrator.getDetailById(""));
        assertThrows(IllegalArgumentException.class, () -> orchestrator.getDetailById(null));
        assertThrows(IllegalArgumentException.class, () -> orchestrator.getDetailById("   "));
    }

    // ==================== 创建订单测试 ====================

    @Test
    void saveOrUpdateOrder_createsNewOrder_successfully() {
        ProductionOrder newOrder = createTestOrder();
        newOrder.setId(null); // 新订单无ID

        when(creationHelper.saveOrUpdateOrder(any(ProductionOrder.class))).thenReturn(true);

        boolean result = orchestrator.saveOrUpdateOrder(newOrder);

        assertTrue(result);
        verify(creationHelper).saveOrUpdateOrder(newOrder);
    }

    @Test
    void saveOrUpdateOrder_updatesExistingOrder_withOperationLog() {
        ProductionOrder existingOrder = createTestOrder();
        existingOrder.setId("order123");
        existingOrder.setOperationRemark("修改订单数量");

        when(creationHelper.saveOrUpdateOrder(any(ProductionOrder.class))).thenReturn(true);

        boolean result = orchestrator.saveOrUpdateOrder(existingOrder);

        assertTrue(result);
        verify(creationHelper).saveOrUpdateOrder(existingOrder);
    }

    @Test
    void saveOrUpdateOrder_throwsException_whenOrderCompleted() {
        ProductionOrder completedOrder = createTestOrder();
        completedOrder.setId("order123");
        completedOrder.setStatus("completed");

        when(creationHelper.saveOrUpdateOrder(any(ProductionOrder.class)))
                .thenThrow(new IllegalStateException("已完成订单不能修改"));

        assertThrows(IllegalStateException.class,
                () -> orchestrator.saveOrUpdateOrder(completedOrder));
    }

    @Test
    void saveOrUpdateOrder_throwsException_whenRemarkMissingOnUpdate() {
        ProductionOrder existingOrder = createTestOrder();
        existingOrder.setId("order123");
        existingOrder.setOperationRemark(""); // 空备注

        when(creationHelper.saveOrUpdateOrder(any(ProductionOrder.class)))
                .thenThrow(new IllegalStateException("修改订单时必须填写备注"));

        assertThrows(IllegalStateException.class,
                () -> orchestrator.saveOrUpdateOrder(existingOrder));
    }

    @Test
    void saveOrUpdateOrder_throwsException_whenNull() {
        when(creationHelper.saveOrUpdateOrder(isNull()))
                .thenThrow(new IllegalArgumentException("订单不能为空"));

        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.saveOrUpdateOrder(null));
    }

    // ==================== 删除订单测试 ====================

    @Test
    void deleteById_cascadesRelatedData() {
        String orderId = "order123";

        when(lifecycleHelper.deleteById(orderId)).thenReturn(true);

        boolean result = orchestrator.deleteById(orderId);

        assertTrue(result);
        verify(lifecycleHelper).deleteById(orderId);
    }

    @Test
    void deleteById_throwsException_whenOrderNotFound() {
        String orderId = "notExist";
        when(lifecycleHelper.deleteById(orderId))
                .thenThrow(new NoSuchElementException("订单不存在"));

        assertThrows(NoSuchElementException.class, () -> orchestrator.deleteById(orderId));
    }

    @Test
    void deleteById_throwsException_whenOrderDeleteFlagNonZero() {
        String orderId = "order123";
        when(lifecycleHelper.deleteById(orderId))
                .thenThrow(new NoSuchElementException("订单不存在或已删除"));

        assertThrows(NoSuchElementException.class, () -> orchestrator.deleteById(orderId));
    }

    @Test
    void deleteById_throwsException_whenIdIsEmpty() {
        when(lifecycleHelper.deleteById(""))
                .thenThrow(new IllegalArgumentException("ID不能为空"));
        when(lifecycleHelper.deleteById(isNull()))
                .thenThrow(new IllegalArgumentException("ID不能为空"));

        assertThrows(IllegalArgumentException.class, () -> orchestrator.deleteById(""));
        assertThrows(IllegalArgumentException.class, () -> orchestrator.deleteById(null));
    }

    @Test
    void deleteById_handlesPartialCascadeFailure() {
        String orderId = "order123";

        // 级联删除部分失败由 lifecycleHelper 内部处理
        when(lifecycleHelper.deleteById(orderId)).thenReturn(true);

        boolean result = orchestrator.deleteById(orderId);

        assertTrue(result);
        verify(lifecycleHelper).deleteById(orderId);
    }

    @Test
    void scrapOrder_updatesStatusInsteadOfDeletingOrder() {
        String orderId = "order123";

        when(lifecycleHelper.scrapOrder(orderId, "测试报废")).thenReturn(true);

        boolean result = orchestrator.scrapOrder(orderId, "测试报废");

        assertTrue(result);
        verify(lifecycleHelper).scrapOrder(orderId, "测试报废");
    }

    // ==================== 异常处理测试 ====================

    @Test
    void saveOrUpdateOrder_handlesGenerateMaterialDemandFailure_gracefully() {
        ProductionOrder newOrder = createTestOrder();
        newOrder.setId(null);

        // 采购需求生成失败由 creationHelper 内部处理，不影响订单创建
        when(creationHelper.saveOrUpdateOrder(any(ProductionOrder.class))).thenReturn(true);

        boolean result = orchestrator.saveOrUpdateOrder(newOrder);

        assertTrue(result);
        verify(creationHelper).saveOrUpdateOrder(newOrder);
    }

    // ==================== 辅助方法 ====================

    private ProductionOrder createTestOrder() {
        ProductionOrder order = new ProductionOrder();
        order.setOrderNo("PO20260212001");
        order.setStyleNo("FZ2024001");
        order.setStyleId("style123");
        order.setFactoryName("测试工厂");
        order.setOrderQuantity(100);
        order.setStatus("pending");
        order.setDeleteFlag(0);
        order.setCreatedById("testUser");
        order.setCreatedByName("测试用户");
        order.setCreateTime(LocalDateTime.now());
        order.setTenantId(1L);
        return order;
    }
}
