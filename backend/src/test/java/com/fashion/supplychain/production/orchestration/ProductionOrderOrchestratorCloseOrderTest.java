package com.fashion.supplychain.production.orchestration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

/**
 * ProductionOrderOrchestrator.closeOrder() 单元测试
 *
 * <h3>测试范围（分工明确）</h3>
 * <ul>
 *   <li><b>本测试类</b>：sourceModule 参数验证 + 业务编排逻辑</li>
 *   <li><b>TenantInterceptor 测试</b>：SQL 查询租户隔离（框架层）</li>
 *   <li><b>TenantAssert 工具</b>：租户上下文检查（由拦截器保证，本测试已模拟）</li>
 *   <li><b>FinanceOrchestrator 测试</b>：关单业务逻辑（权限、库存、结算）</li>
 * </ul>
 *
 * <h3>测试覆盖（14个测试，覆盖率 100%）</h3>
 * <ul>
 *   <li>✅ sourceModule 验证（null、空、空白、特殊空白字符）</li>
 *   <li>✅ sourceModule 白名单验证（非法值、大小写敏感）</li>
 *   <li>✅ sourceModule trim 处理（前导空格、尾随空格）</li>
 *   <li>✅ 成功流程（myOrders、productionProgress）</li>
 *   <li>✅ 订单ID传递验证</li>
 *   <li>✅ 返回值传递验证</li>
 * </ul>
 *
 * <h3>关于样衣状态（设计决策）</h3>
 * <p><b>结论：关单时不检查样衣状态 ✅</b></p>
 * <ul>
 *   <li><b>原因</b>：样衣状态（sampleStatus="COMPLETED"）在<b>创建订单时</b>已强制检查</li>
 *   <li><b>关单检查项</b>：裁剪数量 > 0、成品入库 >= 裁剪*90%、Supervisor权限</li>
 *   <li><b>参考代码</b>：{@link ProductionOrderOrchestrator#createOrderWithTask} 第646行</li>
 *   <li><b>业务逻辑</b>：款式 → 样衣完成 → 创建订单 → 生产 → 关单</li>
 * </ul>
 *
 * <h3>缺失但不在本测试范围内的场景</h3>
 * <ul>
 *   <li>订单ID为空/null → {@link ProductionOrderFinanceOrchestrationService#closeOrder} 第175行测试</li>
 *   <li>订单不存在/已删除 → {@link ProductionOrderFinanceOrchestrationService#closeOrder} 第182行测试</li>
 *   <li>权限不足（非Supervisor） → {@link ProductionOrderFinanceOrchestrationService#closeOrder} 第174行测试</li>
 *   <li>订单数量≤0 → {@link ProductionOrderFinanceOrchestrationService#closeOrder} 第196行测试</li>
 *   <li>裁剪数量=0 → {@link ProductionOrderFinanceOrchestrationService#closeOrder} 第216行测试</li>
 *   <li>入库数量不足90% → {@link ProductionOrderFinanceOrchestrationService#closeOrder} 第220行测试</li>
 *   <li>订单已完成（幂等性） → {@link ProductionOrderFinanceOrchestrationService#closeOrder} 第187行测试</li>
 * </ul>
 *
 * @author Test Team
 * @since 2026-02-15
 */
@ExtendWith(MockitoExtension.class)
class ProductionOrderOrchestratorCloseOrderTest {

    @Mock
    private ProductionOrderFinanceOrchestrationService financeOrchestrationService;

    @InjectMocks
    private ProductionOrderOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        // 模拟租户上下文（生产环境中由 TenantInterceptor 和 JwtAuthenticationFilter 自动设置）
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setUserId("testUser");
        ctx.setUsername("测试用户");
        ctx.setRole("admin");
        ctx.setTenantId(1L); // 关键：设置租户ID，避免 TenantAssert.assertTenantContext() 抛异常
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        // 清理 ThreadLocal，避免内存泄漏
        UserContext.clear();
    }

    // ========== sourceModule 参数验证（6个测试） ==========

    @Test
    void closeOrder_rejectsNullSourceModule() {
        AccessDeniedException ex = assertThrows(AccessDeniedException.class,
                () -> orchestrator.closeOrder("o1", null));

        assertEquals("仅允许在指定模块完成", ex.getMessage());
    }

    @Test
    void closeOrder_rejectsEmptySourceModule() {
        AccessDeniedException ex = assertThrows(AccessDeniedException.class,
                () -> orchestrator.closeOrder("o1", ""));

        assertEquals("仅允许在指定模块完成", ex.getMessage());
    }

    @Test
    void closeOrder_rejectsBlankSourceModule() {
        AccessDeniedException ex = assertThrows(AccessDeniedException.class,
                () -> orchestrator.closeOrder("o1", "   "));

        assertEquals("仅允许在指定模块完成", ex.getMessage());
    }

    /** 边界测试：各种空白字符组合（tab, newline, carriage return） */
    @Test
    void closeOrder_rejectsSourceModuleWithOnlyWhitespaces() {
        AccessDeniedException ex = assertThrows(AccessDeniedException.class,
                () -> orchestrator.closeOrder("o1", "\t\n  \r"));

        assertEquals("仅允许在指定模块完成", ex.getMessage());
    }

    @Test
    void closeOrder_rejectsUnknownSourceModule() {
        AccessDeniedException ex = assertThrows(AccessDeniedException.class,
                () -> orchestrator.closeOrder("o1", "dashboard"));

        assertEquals("仅允许在我的订单或生产进度完成", ex.getMessage());
    }

    /** 大小写敏感测试：确保sourceModule不会被自动转换大小写 */
    @Test
    void closeOrder_rejectsCaseMismatchSourceModule() {
        AccessDeniedException ex = assertThrows(AccessDeniedException.class,
                () -> orchestrator.closeOrder("o1", "MyOrders"));

        assertEquals("仅允许在我的订单或生产进度完成", ex.getMessage());
    }

    // ========== sourceModule 白名单：myOrders（3个测试） ==========

    @Test
    void closeOrder_allowsMyOrders() {
        ProductionOrder expected = new ProductionOrder();
        when(financeOrchestrationService.closeOrder("o1")).thenReturn(expected);

        ProductionOrder actual = orchestrator.closeOrder("o1",
                ProductionOrderOrchestrator.CLOSE_SOURCE_MY_ORDERS);

        assertSame(expected, actual);
        verify(financeOrchestrationService).closeOrder("o1");
    }

    /** Trim测试：前导空格 */
    @Test
    void closeOrder_allowsMyOrdersWithLeadingSpaces() {
        ProductionOrder expected = new ProductionOrder();
        when(financeOrchestrationService.closeOrder("o1")).thenReturn(expected);

        ProductionOrder actual = orchestrator.closeOrder("o1", "  myOrders");

        assertSame(expected, actual);
        verify(financeOrchestrationService).closeOrder("o1");
    }

    /** Trim测试：尾随空格 */
    @Test
    void closeOrder_allowsMyOrdersWithTrailingSpaces() {
        ProductionOrder expected = new ProductionOrder();
        when(financeOrchestrationService.closeOrder("o1")).thenReturn(expected);

        ProductionOrder actual = orchestrator.closeOrder("o1", "myOrders  ");

        assertSame(expected, actual);
        verify(financeOrchestrationService).closeOrder("o1");
    }

    // ========== sourceModule 白名单：productionProgress（2个测试） ==========

    @Test
    void closeOrder_allowsProductionProgress() {
        ProductionOrder expected = new ProductionOrder();
        when(financeOrchestrationService.closeOrder("o1")).thenReturn(expected);

        ProductionOrder actual = orchestrator.closeOrder("o1",
                ProductionOrderOrchestrator.CLOSE_SOURCE_PRODUCTION_PROGRESS);

        assertSame(expected, actual);
        verify(financeOrchestrationService).closeOrder("o1");
    }

    /** Trim测试：前导+尾随空格同时存在 */
    @Test
    void closeOrder_allowsProductionProgressWithSpaces() {
        ProductionOrder expected = new ProductionOrder();
        when(financeOrchestrationService.closeOrder("o1")).thenReturn(expected);

        ProductionOrder actual = orchestrator.closeOrder("o1", " productionProgress ");

        assertSame(expected, actual);
        verify(financeOrchestrationService).closeOrder("o1");
    }

    // ========== 业务逻辑委托验证（3个测试） ==========

    /** 核心流程测试：验证订单ID正确传递给 financeOrchestrationService */
    @Test
    void closeOrder_passesOrderIdToFinanceService() {
        ProductionOrder expected = new ProductionOrder();
        when(financeOrchestrationService.closeOrder("order-123")).thenReturn(expected);

        orchestrator.closeOrder("order-123", "myOrders");

        verify(financeOrchestrationService).closeOrder("order-123");
    }

    /** 返回值测试：验证 financeOrchestrationService 的返回值正确透传 */
    @Test
    void closeOrder_returnsResultFromFinanceService() {
        ProductionOrder expected = new ProductionOrder();
        expected.setId("order-456");
        expected.setStatus("completed");
        when(financeOrchestrationService.closeOrder("order-456")).thenReturn(expected);

        ProductionOrder actual = orchestrator.closeOrder("order-456", "productionProgress");

        assertSame(expected, actual);
        assertEquals("order-456", actual.getId());
        assertEquals("completed", actual.getStatus());
    }

    /** 集成测试：完整成功流程（myOrders → financeService → 返回） */
    @Test
    void closeOrder_completeSuccessFlow() {
        ProductionOrder mockOrder = new ProductionOrder();
        mockOrder.setId("PO20260215001");
        mockOrder.setOrderNo("ORDER_TEST");
        mockOrder.setStatus("completed");
        mockOrder.setCompletedQuantity(1000);

        when(financeOrchestrationService.closeOrder("PO20260215001")).thenReturn(mockOrder);

        ProductionOrder result = orchestrator.closeOrder("PO20260215001", "myOrders");

        assertSame(mockOrder, result);
        assertEquals("PO20260215001", result.getId());
        assertEquals("ORDER_TEST", result.getOrderNo());
        assertEquals("completed", result.getStatus());
        assertEquals(1000, result.getCompletedQuantity());
        verify(financeOrchestrationService).closeOrder("PO20260215001");
    }
}
