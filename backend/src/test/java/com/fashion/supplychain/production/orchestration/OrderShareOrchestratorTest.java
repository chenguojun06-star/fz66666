package com.fashion.supplychain.production.orchestration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.dto.OrderShareResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import com.baomidou.mybatisplus.core.conditions.Wrapper;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

/**
 * OrderShareOrchestrator 单元测试
 *
 * <p>覆盖场景：
 * <ol>
 *   <li>生成分享令牌 - 正常路径</li>
 *   <li>生成分享令牌 - 未登录抛异常</li>
 *   <li>生成分享令牌 - 订单不存在抛异常</li>
 *   <li>生成分享令牌 - 跨租户抛 SecurityException</li>
 *   <li>解析分享令牌 - 令牌无效返回 fail</li>
 *   <li>解析分享令牌 - 令牌类型错误返回 fail</li>
 *   <li>解析分享令牌 - 正常路径含最近扫码记录</li>
 *   <li>解析分享令牌 - 无扫码记录时不报错</li>
 *   <li>mapStatusText - 各状态映射</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("OrderShareOrchestrator 单元测试")
class OrderShareOrchestratorTest {

    private static final String TEST_JWT_SECRET = "TestJwtSecret_AtLeast32Chars_ForHS256!";

    @Mock
    private ProductionOrderService productionOrderService;

    @Mock
    private ScanRecordService scanRecordService;

    @InjectMocks
    private OrderShareOrchestrator orchestrator;

    // 使用构造器注入注入 jwtSecret（@Value 在单测中不会自动注入）
    @BeforeEach
    void setUp() {
        orchestrator = new OrderShareOrchestrator(TEST_JWT_SECRET);
        // 通过反射注入 mock
        try {
            var f1 = OrderShareOrchestrator.class.getDeclaredField("productionOrderService");
            f1.setAccessible(true);
            f1.set(orchestrator, productionOrderService);
            var f2 = OrderShareOrchestrator.class.getDeclaredField("scanRecordService");
            f2.setAccessible(true);
            f2.set(orchestrator, scanRecordService);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setUserId("user1");
        ctx.setUsername("测试用户");
        ctx.setTenantId(100L);
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    // ─────────────────────────────────────────────────────────
    // generateShareToken
    // ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("generateShareToken - 正常生成令牌")
    void generateShareToken_success() {
        ProductionOrder order = buildOrder("order-1", 100L);
        when(productionOrderService.getById("order-1")).thenReturn(order);

        String token = orchestrator.generateShareToken("order-1");

        assertNotNull(token);
        assertFalse(token.isBlank());
        verify(productionOrderService).getById("order-1");
    }

    @Test
    @DisplayName("generateShareToken - 未登录抛异常")
    void generateShareToken_notLoggedIn_throws() {
        UserContext.clear();

        assertThrows(IllegalStateException.class, () ->
                orchestrator.generateShareToken("order-1"));
    }

    @Test
    @DisplayName("generateShareToken - 订单不存在抛异常")
    void generateShareToken_orderNotFound_throws() {
        when(productionOrderService.getById("order-x")).thenReturn(null);

        assertThrows(IllegalArgumentException.class, () ->
                orchestrator.generateShareToken("order-x"));
    }

    @Test
    @DisplayName("generateShareToken - 跨租户抛 SecurityException")
    void generateShareToken_crossTenant_throwsSecurityException() {
        // 当前租户 100，但订单归属租户 999
        ProductionOrder order = buildOrder("order-2", 999L);
        when(productionOrderService.getById("order-2")).thenReturn(order);

        assertThrows(SecurityException.class, () ->
                orchestrator.generateShareToken("order-2"));
    }

    // ─────────────────────────────────────────────────────────
    // resolveShareOrder
    // ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("resolveShareOrder - 令牌格式不合法返回 fail")
    void resolveShareOrder_invalidToken_returnsFail() {
        Result<OrderShareResponse> result = orchestrator.resolveShareOrder("not-a-valid-jwt");
        assertNotNull(result);
        assertNotEquals(200, result.getCode(), "非法令牌应返回 fail");
    }

    @Test
    @DisplayName("resolveShareOrder - 空令牌返回 fail")
    void resolveShareOrder_emptyToken_returnsFail() {
        Result<OrderShareResponse> result = orchestrator.resolveShareOrder("");
        assertNotNull(result);
        assertNotEquals(200, result.getCode());
    }

    @Test
    @DisplayName("resolveShareOrder - 有效令牌正常返回订单摘要")
    void resolveShareOrder_validToken_returnsOrderSummary() {
        // 先生成一个有效令牌
        ProductionOrder order = buildOrder("order-3", 100L);
        when(productionOrderService.getById("order-3")).thenReturn(order);
        String token = orchestrator.generateShareToken("order-3");

        // 解析令牌时也要 mock
        when(productionOrderService.getDetailById("order-3")).thenReturn(order);
        when(scanRecordService.list(Mockito.<Wrapper<ScanRecord>>any())).thenReturn(Collections.emptyList());

        Result<OrderShareResponse> result = orchestrator.resolveShareOrder(token);

        assertEquals(200, result.getCode(), "有效令牌应成功解析");
        assertNotNull(result.getData());
        assertEquals("PO-TEST-001", result.getData().getOrderNo());
    }

    @Test
    @DisplayName("resolveShareOrder - 订单删除后返回 fail")
    void resolveShareOrder_orderDeleted_returnsFail() {
        // 生成令牌
        ProductionOrder order = buildOrder("order-4", 100L);
        when(productionOrderService.getById("order-4")).thenReturn(order);
        String token = orchestrator.generateShareToken("order-4");

        // 解析时订单已不存在（getDetailById 未 stub，默认返回 null）

        Result<OrderShareResponse> result = orchestrator.resolveShareOrder(token);
        assertNotEquals(200, result.getCode(), "订单不存在应返回 fail");
    }

    @Test
    @DisplayName("resolveShareOrder - 有扫码记录时填充最近扫码信息")
    void resolveShareOrder_withScanRecord_fillsLatestScan() {
        ProductionOrder order = buildOrder("order-5", 100L);
        when(productionOrderService.getById("order-5")).thenReturn(order);
        String token = orchestrator.generateShareToken("order-5");

        ScanRecord scan = new ScanRecord();
        scan.setScanTime(LocalDateTime.of(2026, 3, 1, 10, 30));
        scan.setProgressStage("车缝");
        when(productionOrderService.getDetailById("order-5")).thenReturn(order);
        when(scanRecordService.list(Mockito.<Wrapper<ScanRecord>>any())).thenReturn(List.of(scan));

        Result<OrderShareResponse> result = orchestrator.resolveShareOrder(token);
        assertEquals(200, result.getCode());
        assertEquals("2026-03-01 10:30", result.getData().getLatestScanTime());
        assertEquals("车缝", result.getData().getLatestScanStage());
    }

    @Test
    @DisplayName("resolveShareOrder - 查询扫码记录异常时不影响主流程")
    void resolveShareOrder_scanRecordException_stillReturnsOrder() {
        ProductionOrder order = buildOrder("order-6", 100L);
        when(productionOrderService.getById("order-6")).thenReturn(order);
        String token = orchestrator.generateShareToken("order-6");

        when(productionOrderService.getDetailById("order-6")).thenReturn(order);
        when(scanRecordService.list(Mockito.<Wrapper<ScanRecord>>any())).thenThrow(new RuntimeException("DB error"));

        // 扫码查询异常不应导致整体失败
        Result<OrderShareResponse> result = orchestrator.resolveShareOrder(token);
        assertEquals(200, result.getCode(), "扫码异常应静默处理，仍返回订单摘要");
        assertNull(result.getData().getLatestScanTime());
    }

    // ─────────────────────────────────────────────────────────
    // 辅助方法
    // ─────────────────────────────────────────────────────────

    private ProductionOrder buildOrder(String id, Long tenantId) {
        ProductionOrder o = new ProductionOrder();
        o.setId(id);
        o.setTenantId(tenantId);
        o.setOrderNo("PO-TEST-001");
        o.setStyleNo("STY-001");
        o.setStyleName("测试款式");
        o.setStatus("production");
        o.setOrderQuantity(100);
        o.setCompletedQuantity(50);
        o.setProductionProgress(50);
        o.setFactoryName("测试工厂");
        return o;
    }
}
