package com.fashion.supplychain.shop.orchestration;

import com.fashion.supplychain.shop.entity.ShopOrder;
import com.fashion.supplychain.shop.mapper.ShopOrderMapper;
import com.fashion.supplychain.shop.mapper.ShopPlatformMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * P2 买家售后申请单测。
 *
 * <p>重点：只有已发货可申请、状态机不允许重复申请、买家只能对自己的订单发起。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ShopAfterSaleOrchestratorTest {

    @Mock
    private ShopPlatformMapper platformMapper;

    @Mock
    private ShopOrderMapper shopOrderMapper;

    @InjectMocks
    private ShopAfterSaleOrchestrator orchestrator;

    private Map<String, Object> order(String status, String afterSaleStatus) {
        Map<String, Object> m = new HashMap<>();
        m.put("orderId", "o1");
        m.put("orderNo", "SH1");
        m.put("status", status);
        m.put("afterSaleStatus", afterSaleStatus);
        return m;
    }

    @Test
    @DisplayName("订单不属于本人 / 不存在 → 拒绝")
    void orderNotFound() {
        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(null);
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.applyByConsumer("c1", "SH1", "REFUND_ONLY", "不好看"));
        assertTrue(e.getMessage().contains("订单不存在"));
        verify(shopOrderMapper, never()).updateById(any(ShopOrder.class));
    }

    @Test
    @DisplayName("未发货 → 提示走取消订单；已取消 → 不可申请")
    void statusGuard() {
        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(order("PENDING_SHIP", "NONE"));
        IllegalArgumentException e1 = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.applyByConsumer("c1", "SH1", "REFUND_ONLY", null));
        assertTrue(e1.getMessage().contains("取消订单"));

        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(order("CANCELLED", "NONE"));
        IllegalArgumentException e2 = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.applyByConsumer("c1", "SH1", "REFUND_ONLY", null));
        assertTrue(e2.getMessage().contains("已取消"));
    }

    @Test
    @DisplayName("类型非法 → 拒绝")
    void typeGuard() {
        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(order("SHIPPED", "NONE"));
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.applyByConsumer("c1", "SH1", "WHATEVER", null));
    }

    @Test
    @DisplayName("已有待处理 / 已完成售后 → 拒绝重复申请")
    void duplicateGuard() {
        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(order("SHIPPED", "APPLIED"));
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.applyByConsumer("c1", "SH1", "REFUND_ONLY", null));

        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(order("SHIPPED", "APPROVED"));
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.applyByConsumer("c1", "SH1", "REFUND_ONLY", null));
    }

    @Test
    @DisplayName("被拒绝后可再次申请（REJECTED 不锁死）")
    void canReapplyAfterRejected() {
        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(order("SHIPPED", "REJECTED"));
        orchestrator.applyByConsumer("c1", "SH1", "RETURN_REFUND", "尺码偏小");
        ArgumentCaptor<ShopOrder> captor = ArgumentCaptor.forClass(ShopOrder.class);
        verify(shopOrderMapper).updateById(captor.capture());
        assertEquals("APPLIED", captor.getValue().getAfterSaleStatus());
        assertEquals("RETURN_REFUND", captor.getValue().getAfterSaleType());
        assertEquals("尺码偏小", captor.getValue().getAfterSaleReason());
    }

    @Test
    @DisplayName("正常申请：写入 APPLIED + 类型 + 原因")
    void applySuccess() {
        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(order("SHIPPED", null));
        orchestrator.applyByConsumer("c1", "SH1", "REFUND_ONLY", "  颜色不符  ");

        ArgumentCaptor<ShopOrder> captor = ArgumentCaptor.forClass(ShopOrder.class);
        verify(shopOrderMapper).updateById(captor.capture());
        assertEquals("o1", captor.getValue().getId());
        assertEquals("APPLIED", captor.getValue().getAfterSaleStatus());
        assertEquals("颜色不符", captor.getValue().getAfterSaleReason());
    }

    @Test
    @DisplayName("原因过长 → 拒绝")
    void reasonTooLong() {
        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(order("SHIPPED", "NONE"));
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.applyByConsumer("c1", "SH1", "REFUND_ONLY", "x".repeat(201)));
    }
}
