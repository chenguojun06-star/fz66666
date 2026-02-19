package com.fashion.supplychain.production.orchestration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
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
        newOrder.setStyleId("style123");

        doNothing().when(helper).validatePersonnelFields(newOrder);
        doNothing().when(helper).validateUnitPriceSources(newOrder);
        doNothing().when(helper).checkPatternCompleteWarning(anyString());

        when(productionOrderService.saveOrUpdateOrder(any())).thenAnswer(invocation -> {
            ProductionOrder order = invocation.getArgument(0);
            order.setId("newOrderId123");
            return true;
        });

        when(materialPurchaseService.generateDemandByOrderId(anyString(), anyBoolean())).thenReturn(Collections.emptyList());

        boolean result = orchestrator.saveOrUpdateOrder(newOrder);

        assertTrue(result);
        verify(productionOrderService).saveOrUpdateOrder(newOrder);
        verify(helper).validatePersonnelFields(newOrder);
        verify(helper).validateUnitPriceSources(newOrder);
        verify(materialPurchaseService).generateDemandByOrderId(eq("newOrderId123"), eq(false));
    }

    @Test
    void saveOrUpdateOrder_updatesExistingOrder_withOperationLog() {
        ProductionOrder existingOrder = createTestOrder();
        existingOrder.setId("order123");
        existingOrder.setStatus("pending");
        existingOrder.setDeleteFlag(0);
        existingOrder.setOperationRemark("修改订单数量");

        when(productionOrderService.getById("order123")).thenReturn(existingOrder);
        when(helper.safeText("pending")).thenReturn("pending");
        doNothing().when(helper).validatePersonnelFields(existingOrder);
        doNothing().when(helper).validateUnitPriceSources(existingOrder);
        when(productionOrderService.saveOrUpdateOrder(existingOrder)).thenReturn(true);

        boolean result = orchestrator.saveOrUpdateOrder(existingOrder);

        assertTrue(result);
        verify(productionOrderService).saveOrUpdateOrder(existingOrder);
        verify(scanRecordDomainService).insertOrderOperationRecord(
                any(ProductionOrder.class), eq("编辑"), eq("修改订单数量"), any(LocalDateTime.class));
    }

    @Test
    void saveOrUpdateOrder_throwsException_whenOrderCompleted() {
        ProductionOrder completedOrder = createTestOrder();
        completedOrder.setId("order123");
        completedOrder.setStatus("completed");
        completedOrder.setDeleteFlag(0);

        when(productionOrderService.getById("order123")).thenReturn(completedOrder);
        when(helper.safeText("completed")).thenReturn("completed");

        assertThrows(IllegalStateException.class,
                () -> orchestrator.saveOrUpdateOrder(completedOrder));
        verify(productionOrderService, never()).saveOrUpdateOrder(any());
    }

    @Test
    void saveOrUpdateOrder_throwsException_whenRemarkMissingOnUpdate() {
        ProductionOrder existingOrder = createTestOrder();
        existingOrder.setId("order123");
        existingOrder.setStatus("pending");
        existingOrder.setDeleteFlag(0);
        existingOrder.setOperationRemark(""); // 空备注

        when(productionOrderService.getById("order123")).thenReturn(existingOrder);
        when(helper.safeText("pending")).thenReturn("pending");

        assertThrows(IllegalStateException.class,
                () -> orchestrator.saveOrUpdateOrder(existingOrder));
        verify(productionOrderService, never()).saveOrUpdateOrder(any());
    }

    @Test
    void saveOrUpdateOrder_throwsException_whenNull() {
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.saveOrUpdateOrder(null));
    }

    // ==================== 删除订单测试 ====================

    @Test
    void deleteById_cascadesRelatedData() {
        String orderId = "order123";
        ProductionOrder order = createTestOrder();
        order.setId(orderId);
        order.setDeleteFlag(0);

        when(productionOrderService.getById(orderId)).thenReturn(order);
        when(productionOrderService.deleteById(orderId)).thenReturn(true);

        boolean result = orchestrator.deleteById(orderId);

        assertTrue(result);
        verify(productionOrderService).deleteById(orderId);
        verify(materialPurchaseService).deleteByOrderId(orderId);
        verify(cuttingTaskService).deleteByOrderId(orderId);
        verify(scanRecordService).deleteByOrderId(orderId);
    }

    @Test
    void deleteById_throwsException_whenOrderNotFound() {
        String orderId = "notExist";
        when(productionOrderService.getById(orderId)).thenReturn(null);

        assertThrows(NoSuchElementException.class, () -> orchestrator.deleteById(orderId));
        verify(productionOrderService, never()).deleteById(any());
    }

    @Test
    void deleteById_throwsException_whenOrderDeleteFlagNonZero() {
        String orderId = "order123";
        ProductionOrder deletedOrder = createTestOrder();
        deletedOrder.setId(orderId);
        deletedOrder.setDeleteFlag(1);

        when(productionOrderService.getById(orderId)).thenReturn(deletedOrder);

        assertThrows(NoSuchElementException.class, () -> orchestrator.deleteById(orderId));
        verify(productionOrderService, never()).deleteById(any());
    }

    @Test
    void deleteById_throwsException_whenIdIsEmpty() {
        assertThrows(IllegalArgumentException.class, () -> orchestrator.deleteById(""));
        assertThrows(IllegalArgumentException.class, () -> orchestrator.deleteById(null));
    }

    @Test
    void deleteById_handlesPartialCascadeFailure() {
        String orderId = "order123";
        ProductionOrder order = createTestOrder();
        order.setId(orderId);
        order.setDeleteFlag(0);

        when(productionOrderService.getById(orderId)).thenReturn(order);
        when(productionOrderService.deleteById(orderId)).thenReturn(true);
        doThrow(new RuntimeException("采购删除失败")).when(materialPurchaseService).deleteByOrderId(orderId);

        // 级联删除部分失败不影响主订单删除
        boolean result = orchestrator.deleteById(orderId);

        assertTrue(result);
        verify(productionOrderService).deleteById(orderId);
        // 即使采购删除失败，其他级联删除仍继续
        verify(cuttingTaskService).deleteByOrderId(orderId);
        verify(scanRecordService).deleteByOrderId(orderId);
    }

    // ==================== 异常处理测试 ====================

    @Test
    void saveOrUpdateOrder_handlesGenerateMaterialDemandFailure_gracefully() {
        ProductionOrder newOrder = createTestOrder();
        newOrder.setId(null);
        newOrder.setStyleId("style123");

        doNothing().when(helper).validatePersonnelFields(newOrder);
        doNothing().when(helper).validateUnitPriceSources(newOrder);
        doNothing().when(helper).checkPatternCompleteWarning(anyString());

        when(productionOrderService.saveOrUpdateOrder(any())).thenAnswer(invocation -> {
            ProductionOrder order = invocation.getArgument(0);
            order.setId("newOrderId123");
            return true;
        });

        doThrow(new RuntimeException("库存不足"))
                .when(materialPurchaseService).generateDemandByOrderId(anyString(), anyBoolean());

        // 订单创建成功，采购需求生成失败不影响订单创建
        boolean result = orchestrator.saveOrUpdateOrder(newOrder);

        assertTrue(result);
        verify(scanRecordDomainService).insertOrchestrationFailure(
                any(ProductionOrder.class), eq("generateMaterialDemand"), contains("库存不足"), any());
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
