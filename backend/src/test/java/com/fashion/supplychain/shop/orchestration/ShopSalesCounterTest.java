package com.fashion.supplychain.shop.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.shop.entity.ShopOrder;
import com.fashion.supplychain.shop.entity.ShopOrderItem;
import com.fashion.supplychain.shop.mapper.ShopOrderItemMapper;
import com.fashion.supplychain.shop.mapper.ShopOrderMapper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * D-811：真实销量的口径测试。
 *
 * <p>这类数字最危险的不是算错，而是「把不该算的算进去」——
 * 取消的订单算成销量等于把退货也报喜。所以口径必须钉死。
 */
class ShopSalesCounterTest {

    @Mock
    private ShopOrderMapper orderMapper;

    @Mock
    private ShopOrderItemMapper itemMapper;

    @InjectMocks
    private ShopSalesCounter counter;

    /**
     * 用到 lambda 条件构造器时 MyBatis-Plus 需要实体元数据缓存，
     * 没初始化会抛 {@code can not find lambda cache for this entity}。
     * 同 ShopConsumerOrchestratorTest 的既有做法。
     */
    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, ShopOrder.class);
        TableInfoHelper.initTableInfo(assistant, ShopOrderItem.class);
    }

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        UserContext ctx = new UserContext();
        ctx.setTenantId(2L);
        ctx.setUserId("u-sales-1");
        ctx.setTenantOwner(true);
        UserContext.set(ctx);
        when(orderMapper.selectList(any())).thenReturn(List.of());
        when(itemMapper.selectList(any())).thenReturn(List.of());
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    private ShopOrder order(String id, String status) {
        ShopOrder o = new ShopOrder();
        o.setId(id);
        o.setStatus(status);
        return o;
    }

    /** 带 styleId 的明细行（V202710160006 之后的主力行）。 */
    private ShopOrderItem item(String orderId, String styleNo, Integer qty) {
        return item(orderId, styleNo, qty, null);
    }

    private ShopOrderItem item(String orderId, String styleNo, Integer qty, Long styleId) {
        ShopOrderItem i = new ShopOrderItem();
        i.setOrderId(orderId);
        i.setStyleNo(styleNo);
        i.setQuantity(qty);
        i.setStyleId(styleId);
        return i;
    }

    @Test
    @DisplayName("只统计已发货/待发货订单，取消订单完全不计入")
    void excludesCancelledOrders() {
        // 用真实 lambda-wrapper 无法在单测里构造条件，这里验证「返回的订单集合被正确使用」：
        // 只给已发货订单 → 销量只来自它
        when(orderMapper.selectList(any())).thenReturn(List.of(order("O1", "SHIPPED")));
        when(itemMapper.selectList(any())).thenReturn(List.of(item("O1", "AAA", 2, 100L)));

        assertEquals(Map.of(100L, 2), counter.soldQtyByStyleId(2L));
    }

    @Test
    @DisplayName("同一款式的多行明细累加，不是取最大也不是取第一行")
    void sumsQuantitiesPerStyle() {
        when(orderMapper.selectList(any())).thenReturn(List.of(order("O1", "SHIPPED"), order("O2", "SHIPPED")));
        when(itemMapper.selectList(any())).thenReturn(List.of(
                item("O1", "AAA", 1, 100L),
                item("O1", "AAA", 3, 100L),
                item("O2", "BBB", 2, 200L)));

        Map<Long, Integer> out = counter.soldQtyByStyleId(2L);

        assertEquals(4, out.get(100L));
        assertEquals(2, out.get(200L));
    }

    @Test
    @DisplayName("脏数据：0 件 / 负数 / 空数量都不计入（不能把 0 累加成 0 掩盖缺失）")
    void ignoresDirtyRows() {
        when(orderMapper.selectList(any())).thenReturn(List.of(order("O1", "SHIPPED")));
        when(itemMapper.selectList(any())).thenReturn(List.of(
                item("O1", "AAA", 0, 100L),
                item("O1", "AAA", -2, 100L),
                item("O1", "AAA", null, 100L),
                item("O1", "AAA", 1, 100L)));

        Map<Long, Integer> out = counter.soldQtyByStyleId(2L);

        assertEquals(Map.of(100L, 1), out);
    }

    @Test
    @DisplayName("**改款号不影响销量**：同一 styleId 下款号变了，销量仍按 style_id 归集")
    void styleNoChangeDoesNotBreakSales() {
        // 这就是补 style_id 的根因：以前只有款号，改号后历史销量直接断链
        when(orderMapper.selectList(any())).thenReturn(List.of(order("O1", "SHIPPED")));
        when(itemMapper.selectList(any())).thenReturn(List.of(
                item("O1", "OLD-AAA", 2, 100L),
                item("O1", "NEW-AAA", 3, 100L)));

        Map<Long, Integer> out = counter.soldQtyByStyleId(2L);

        assertEquals(5, out.get(100L), "款号从 OLD-AAA 改成 NEW-AAA，销量必须仍是 5 而不是 3");
    }

    @Test
    @DisplayName("style_id 为空的存量行不计入主口径（避免和款号兜底重复计算）")
    void nullStyleIdNotCountedInPrimary() {
        when(orderMapper.selectList(any())).thenReturn(List.of(order("O1", "SHIPPED")));
        when(itemMapper.selectList(any())).thenReturn(List.of(
                item("O1", "AAA", 5, null)));

        assertTrue(counter.soldQtyByStyleId(2L).isEmpty(),
                "style_id 为空的行走兜底口径，主口径必须跳过，否则销量翻倍");
    }

    @Test
    @DisplayName("没有订单时返回空 Map —— 不是「销量 0」（两者在业务上不同）")
    void noOrdersMeansNoEntry() {
        assertTrue(counter.soldQtyByStyleId(2L).isEmpty());
    }

    @Test
    @DisplayName("有订单但无明细时返回空 Map，不抛异常")
    void ordersWithoutItems() {
        when(orderMapper.selectList(any())).thenReturn(List.of(order("O1", "SHIPPED")));
        when(itemMapper.selectList(any())).thenReturn(List.of());

        assertTrue(counter.soldQtyByStyleId(2L).isEmpty());
    }

    @Test
    @DisplayName("订单 id 为空的行会被跳过（关联条件为空会退化成全表查询）")
    void skipsBlankOrderIds() {
        when(orderMapper.selectList(any())).thenReturn(List.of(order(null, "SHIPPED")));
        when(itemMapper.selectList(ArgumentMatchers.any())).thenReturn(List.of(item("O1", "AAA", 3)));

        assertTrue(counter.soldQtyByStyleId(2L).isEmpty());
    }

    @Test
    @DisplayName("tenantId 为空时返回空：顾客端免登录请求没有 UserContext")
    void nullTenantYieldsNoSales() {
        when(orderMapper.selectList(any())).thenReturn(List.of(order("O1", "SHIPPED")));
        when(itemMapper.selectList(any())).thenReturn(List.of(item("O1", "AAA", 3)));

        // D-811 线上实测踩过：单测里手动设了 UserContext 所以全绿，
        // 线上顾客端是免登录请求、UserContext 为空 → 销量恒为 0。
        // 这里显式锁住「租户不明就不统计」，防止有人又改回读 UserContext。
        assertTrue(counter.soldQtyByStyleId(null).isEmpty());
        // 连查询都不该发出去 —— 拿不到租户还去查，等于全表扫描
        org.mockito.Mockito.verify(orderMapper, org.mockito.Mockito.never())
                .selectList(any());
    }

    @Test
    @DisplayName("不依赖 UserContext：即使调用方上下文是别的租户，也按传入租户查")
    void usesExplicitTenantNotContext() {
        // UserContext 里放的是租户 99，而调用方传的是 2
        UserContext ctx = new UserContext();
        ctx.setTenantId(99L);
        ctx.setUserId("u-other");
        UserContext.set(ctx);

        when(orderMapper.selectList(any())).thenReturn(List.of(order("O1", "SHIPPED")));
        when(itemMapper.selectList(any())).thenReturn(List.of(item("O1", "AAA", 2, 100L)));

        assertEquals(Map.of(100L, 2), counter.soldQtyByStyleId(2L));
    }
}
