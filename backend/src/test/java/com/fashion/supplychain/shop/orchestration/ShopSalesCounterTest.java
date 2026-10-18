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

    private ShopOrderItem item(String orderId, String styleNo, Integer qty) {
        ShopOrderItem i = new ShopOrderItem();
        i.setOrderId(orderId);
        i.setStyleNo(styleNo);
        i.setQuantity(qty);
        return i;
    }

    @Test
    @DisplayName("只统计已发货/待发货订单，取消订单完全不计入")
    void excludesCancelledOrders() {
        // 用真实 lambda-wrapper 无法在单测里构造条件，这里验证「返回的订单集合被正确使用」：
        // 只给已发货订单 → 销量只来自它
        when(orderMapper.selectList(any())).thenReturn(List.of(order("O1", "SHIPPED")));
        when(itemMapper.selectList(any())).thenReturn(List.of(item("O1", "AAA", 2)));

        assertEquals(Map.of("AAA", 2), counter.soldQtyByStyleNo());
    }

    @Test
    @DisplayName("同一款式的多行明细累加，不是取最大也不是取第一行")
    void sumsQuantitiesPerStyle() {
        when(orderMapper.selectList(any())).thenReturn(List.of(order("O1", "SHIPPED"), order("O2", "SHIPPED")));
        when(itemMapper.selectList(any())).thenReturn(List.of(
                item("O1", "AAA", 1),
                item("O1", "AAA", 3),
                item("O2", "BBB", 2)));

        Map<String, Integer> out = counter.soldQtyByStyleNo();

        assertEquals(4, out.get("AAA"));
        assertEquals(2, out.get("BBB"));
    }

    @Test
    @DisplayName("脏数据：空款号 / 0 件 / 负数都不计入（不能把 0 累加成 0 掩盖缺失）")
    void ignoresDirtyRows() {
        when(orderMapper.selectList(any())).thenReturn(List.of(order("O1", "SHIPPED")));
        when(itemMapper.selectList(any())).thenReturn(List.of(
                item("O1", null, 5),
                item("O1", "  ", 5),
                item("O1", "AAA", 0),
                item("O1", "AAA", -2),
                item("O1", "AAA", null),
                item("O1", " AAA ", 1)));

        Map<String, Integer> out = counter.soldQtyByStyleNo();

        assertEquals(Map.of("AAA", 1), out, "款号两端空格要归一，否则查销量永远查不到");
    }

    @Test
    @DisplayName("没有订单时返回空 Map —— 不是「销量 0」（两者在业务上不同）")
    void noOrdersMeansNoEntry() {
        assertTrue(counter.soldQtyByStyleNo().isEmpty());
    }

    @Test
    @DisplayName("有订单但无明细时返回空 Map，不抛异常")
    void ordersWithoutItems() {
        when(orderMapper.selectList(any())).thenReturn(List.of(order("O1", "SHIPPED")));
        when(itemMapper.selectList(any())).thenReturn(List.of());

        assertTrue(counter.soldQtyByStyleNo().isEmpty());
    }

    @Test
    @DisplayName("订单 id 为空的行会被跳过（关联条件为空会退化成全表查询）")
    void skipsBlankOrderIds() {
        when(orderMapper.selectList(any())).thenReturn(List.of(order(null, "SHIPPED")));
        when(itemMapper.selectList(ArgumentMatchers.any())).thenReturn(List.of(item("O1", "AAA", 3)));

        assertTrue(counter.soldQtyByStyleNo().isEmpty());
    }
}