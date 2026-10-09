package com.fashion.supplychain.shop.orchestration;

import com.fashion.supplychain.shop.entity.ShopOrder;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * P1 跨店结算单测。
 *
 * <p>核心口径：**一单只含一个店铺**；某店失败不能拖垮其他店；失败店铺的商品留在购物车。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ShopCheckoutOrchestratorTest {

    @Mock
    private ShopCartOrchestrator cartOrchestrator;

    @Mock
    private ShopOrderOrchestrator shopOrderOrchestrator;

    @InjectMocks
    private ShopCheckoutOrchestrator orchestrator;

    private Map<String, Object> row(long tenantId, String slug, String shopName, boolean available,
                                    String reason, String cartItemId, long skuId, int qty) {
        Map<String, Object> m = new HashMap<>();
        m.put("tenantId", tenantId);
        m.put("slug", slug);
        m.put("shopName", shopName);
        m.put("available", available);
        m.put("unavailableReason", reason);
        m.put("cartItemId", cartItemId);
        m.put("skuId", skuId);
        m.put("quantity", qty);
        m.put("styleName", "款" + tenantId);
        return m;
    }

    private ShopOrder order(String no, String total) {
        ShopOrder o = new ShopOrder();
        o.setOrderNo(no);
        o.setTotalAmount(new BigDecimal(total));
        o.setGoodsAmount(new BigDecimal(total));
        o.setShippingFee(BigDecimal.ZERO);
        o.setItemCount(1);
        return o;
    }

    @Test
    @DisplayName("购物车为空 → 明确拒绝")
    void emptyCart() {
        when(cartOrchestrator.rowsForCheckout("c1")).thenReturn(new ArrayList<>());
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.checkout("c1", "张三", "13900000000", "地址", null, null));
        assertTrue(e.getMessage().contains("空的"));
    }

    @Test
    @DisplayName("两家店各出一张订单，成功的店铺清购物车")
    void oneOrderPerStore() {
        List<Map<String, Object>> rows = new ArrayList<>();
        rows.add(row(2L, "t2", "A店", true, null, "ci1", 101L, 1));
        rows.add(row(3L, "t3", "B店", true, null, "ci2", 201L, 2));
        when(cartOrchestrator.rowsForCheckout("c1")).thenReturn(rows);
        when(shopOrderOrchestrator.placeOrder(eq("t2"), anyString(), anyString(), anyString(),
                any(), anyList(), eq("c1"))).thenReturn(order("SH1", "50.00"));
        when(shopOrderOrchestrator.placeOrder(eq("t3"), anyString(), anyString(), anyString(),
                any(), anyList(), eq("c1"))).thenReturn(order("SH2", "80.00"));

        Map<String, Object> data = orchestrator.checkout("c1", "张三", "13900000000", "地址", null, null);

        assertEquals(2, data.get("storeCount"));
        assertEquals(2, data.get("successCount"));
        assertEquals(0, data.get("failedCount"));
        assertEquals(new BigDecimal("130.00"), data.get("paidAmount"));
        verify(cartOrchestrator).removeRows(List.of("ci1"));
        verify(cartOrchestrator).removeRows(List.of("ci2"));
    }

    @Test
    @DisplayName("某店下单失败：不拖垮其他店，且失败店的行留在购物车")
    void failureIsolatedPerStore() {
        List<Map<String, Object>> rows = new ArrayList<>();
        rows.add(row(2L, "t2", "A店", true, null, "ci1", 101L, 1));
        rows.add(row(3L, "t3", "B店", true, null, "ci2", 201L, 1));
        when(cartOrchestrator.rowsForCheckout("c1")).thenReturn(rows);
        when(shopOrderOrchestrator.placeOrder(eq("t2"), anyString(), anyString(), anyString(),
                any(), anyList(), eq("c1"))).thenReturn(order("SH1", "50.00"));
        when(shopOrderOrchestrator.placeOrder(eq("t3"), anyString(), anyString(), anyString(),
                any(), anyList(), eq("c1"))).thenThrow(new IllegalArgumentException("店铺已打烊，暂时无法下单"));

        Map<String, Object> data = orchestrator.checkout("c1", "张三", "13900000000", "地址", null, null);

        assertEquals(1, data.get("successCount"));
        assertEquals(1, data.get("failedCount"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> orders = (List<Map<String, Object>>) data.get("orders");
        assertEquals(Boolean.TRUE, orders.get(0).get("success"));
        assertEquals(Boolean.FALSE, orders.get(1).get("success"));
        assertTrue(String.valueOf(orders.get(1).get("message")).contains("打烊"));
        // 只有成功的店清行
        verify(cartOrchestrator).removeRows(List.of("ci1"));
        verify(cartOrchestrator, never()).removeRows(List.of("ci2"));
    }

    @Test
    @DisplayName("失效商品：整店不提交并给出可读原因")
    void invalidItemBlocksStore() {
        List<Map<String, Object>> rows = new ArrayList<>();
        rows.add(row(2L, "t2", "A店", false, "库存仅剩 1 件", "ci1", 101L, 5));
        when(cartOrchestrator.rowsForCheckout("c1")).thenReturn(rows);

        Map<String, Object> data = orchestrator.checkout("c1", "张三", "13900000000", "地址", null, null);

        assertEquals(0, data.get("successCount"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> orders = (List<Map<String, Object>>) data.get("orders");
        assertTrue(String.valueOf(orders.get(0).get("message")).contains("库存仅剩 1 件"));
        verify(shopOrderOrchestrator, never()).placeOrder(anyString(), anyString(), anyString(),
                anyString(), any(), anyList(), anyString());
        verify(cartOrchestrator, never()).removeRows(anyList());
    }

    @Test
    @DisplayName("只结算选中的店铺（tenantIds 过滤）")
    void settleSelectedStoresOnly() {
        List<Map<String, Object>> rows = new ArrayList<>();
        rows.add(row(2L, "t2", "A店", true, null, "ci1", 101L, 1));
        rows.add(row(3L, "t3", "B店", true, null, "ci2", 201L, 1));
        when(cartOrchestrator.rowsForCheckout("c1")).thenReturn(rows);
        when(shopOrderOrchestrator.placeOrder(eq("t3"), anyString(), anyString(), anyString(),
                any(), anyList(), eq("c1"))).thenReturn(order("SH2", "80.00"));

        Map<String, Object> data = orchestrator.checkout("c1", "张三", "13900000000", "地址", null, List.of(3L));

        assertEquals(1, data.get("storeCount"));
        ArgumentCaptor<String> slug = ArgumentCaptor.forClass(String.class);
        verify(shopOrderOrchestrator).placeOrder(slug.capture(), anyString(), anyString(), anyString(),
                any(), anyList(), eq("c1"));
        assertEquals("t3", slug.getValue());
        assertFalse(((List<?>) data.get("orders")).isEmpty());
    }

    @Test
    @DisplayName("缺收货信息 → 拒绝（不进入任何店铺下单）")
    void requireReceiver() {
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.checkout("c1", "", "13900000000", "地址", null, null));
        verify(shopOrderOrchestrator, never()).placeOrder(anyString(), anyString(), anyString(),
                anyString(), any(), anyList(), anyString());
    }
}
