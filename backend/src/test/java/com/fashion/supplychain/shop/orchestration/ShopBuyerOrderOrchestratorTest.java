package com.fashion.supplychain.shop.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.shop.mapper.ShopPlatformMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * P2 买家取消订单单测。
 *
 * <p>重点：只有待发货可取消、必须按 orderNo + consumerId 定位、
 * 执行时上下文真的切到订单所属租户（否则商家侧 requireOrder 会 NPE / 越权）。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ShopBuyerOrderOrchestratorTest {

    @Mock
    private ShopPlatformMapper platformMapper;

    @Mock
    private ShopAdminOrchestrator shopAdminOrchestrator;

    /** 真跑上下文切换，验证「执行期间 tenantId 确实被设置」 */
    @Spy
    private ShopTenantContextRunner tenantContextRunner = new ShopTenantContextRunner();

    @InjectMocks
    private ShopBuyerOrderOrchestrator orchestrator;

    @AfterEach
    void clearCtx() {
        UserContext.clear();
    }

    private Map<String, Object> order(String status) {
        Map<String, Object> m = new HashMap<>();
        m.put("orderId", "o1");
        m.put("orderNo", "SH1");
        m.put("tenantId", 7L);
        m.put("phone", "13900001234");
        m.put("status", status);
        return m;
    }

    @Test
    @DisplayName("订单不属于本人 → 拒绝")
    void notFound() {
        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(null);
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.cancelByConsumer("c1", "SH1", "下错了"));
        assertTrue(e.getMessage().contains("订单不存在"));
        verify(shopAdminOrchestrator, never()).cancelOrder(org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    @DisplayName("已发货 → 引导走售后；已取消 → 提示无需重复")
    void statusGuard() {
        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(order("SHIPPED"));
        IllegalArgumentException e1 = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.cancelByConsumer("c1", "SH1", null));
        assertTrue(e1.getMessage().contains("售后"));

        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(order("CANCELLED"));
        IllegalArgumentException e2 = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.cancelByConsumer("c1", "SH1", null));
        assertTrue(e2.getMessage().contains("已取消"));
    }

    @Test
    @DisplayName("取消成功：以订单所属租户身份执行既有取消逻辑，执行期间 tenantId 正确")
    void cancelSwitchesTenant() {
        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(order("PENDING_SHIP"));
        // 用 doAnswer 在调用瞬间检查上下文
        org.mockito.Mockito.doAnswer(inv -> {
            assertEquals(7L, UserContext.tenantId(), "执行取消时必须已切到订单所属租户");
            assertEquals("买家1234", UserContext.username());
            return null;
        }).when(shopAdminOrchestrator).cancelOrder("o1", "下错了");

        orchestrator.cancelByConsumer("c1", "SH1", "  下错了  ");

        verify(shopAdminOrchestrator).cancelOrder("o1", "下错了");
        // 结束后必须恢复（原来是 null → 清空）
        assertNull(UserContext.get(), "执行完必须恢复原上下文，不能把租户上下文泄漏给后续请求");
    }

    @Test
    @DisplayName("未填原因 → 用默认文案（仍会写进订单留痕）")
    void defaultReason() {
        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(order("PENDING_SHIP"));
        orchestrator.cancelByConsumer("c1", "SH1", "   ");
        verify(shopAdminOrchestrator).cancelOrder("o1", "买家主动取消");
        assertNotNull(platformMapper);
    }

    @Test
    @DisplayName("原因过长 → 拒绝")
    void reasonTooLong() {
        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(order("PENDING_SHIP"));
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.cancelByConsumer("c1", "SH1", "x".repeat(201)));
    }
}
