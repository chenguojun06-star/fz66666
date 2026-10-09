package com.fashion.supplychain.shop.orchestration;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fashion.supplychain.shop.entity.ShopReview;
import com.fashion.supplychain.shop.mapper.ShopPlatformMapper;
import com.fashion.supplychain.shop.mapper.ShopReviewMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
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
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * P2 商品评价单测。
 *
 * <p>重点：只有已发货可评价、款式必须在订单里、一单一款只能评一次、
 * 星级与字数校验、均分与条数聚合口径。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ShopReviewOrchestratorTest {

    @Mock
    private ShopReviewMapper reviewMapper;

    @Mock
    private ShopPlatformMapper platformMapper;

    @InjectMocks
    private ShopReviewOrchestrator orchestrator;

    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, ShopReview.class);
    }

    private Map<String, Object> order(String status) {
        Map<String, Object> m = new HashMap<>();
        m.put("orderId", "o1");
        m.put("orderNo", "SH1");
        m.put("status", status);
        m.put("tenantId", 2L);
        return m;
    }

    private List<Map<String, Object>> items(String... styleNos) {
        List<Map<String, Object>> list = new ArrayList<>();
        for (String no : styleNos) {
            Map<String, Object> m = new HashMap<>();
            m.put("styleNo", no);
            m.put("skuId", 101L);
            list.add(m);
        }
        return list;
    }

    @Test
    @DisplayName("星级非法 → 拒绝")
    void ratingGuard() {
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.submit("c1", "SH1", "SN1", 0, null, false));
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.submit("c1", "SH1", "SN1", 6, null, false));
    }

    @Test
    @DisplayName("订单不存在 / 未发货 → 拒绝")
    void orderGuard() {
        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(null);
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.submit("c1", "SH1", "SN1", 5, null, false));

        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(order("PENDING_SHIP"));
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.submit("c1", "SH1", "SN1", 5, null, false));
        assertTrue(e.getMessage().contains("已发货"));
        verify(reviewMapper, never()).insert(any(ShopReview.class));
    }

    @Test
    @DisplayName("款式不在订单里 → 拒绝（不能给别的商品打分）")
    void styleMustBeInOrder() {
        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(order("SHIPPED"));
        when(platformMapper.listOrderItems("SH1")).thenReturn(items("SN1"));
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.submit("c1", "SH1", "OTHER", 5, null, false));
        assertTrue(e.getMessage().contains("不在此订单"));
    }

    @Test
    @DisplayName("一单一款只能评一次")
    void oneReviewPerStyle() {
        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(order("SHIPPED"));
        when(platformMapper.listOrderItems("SH1")).thenReturn(items("SN1"));
        ShopReview exist = new ShopReview();
        exist.setId("r1");
        when(reviewMapper.selectOne(any(Wrapper.class))).thenReturn(exist);

        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.submit("c1", "SH1", "SN1", 5, "好", false));
        assertTrue(e.getMessage().contains("已评价过"));
        verify(reviewMapper, never()).insert(any(ShopReview.class));
    }

    @Test
    @DisplayName("评价成功：落 style_id / tenant_id / 星级 / 匿名标记")
    void submitSuccess() {
        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(order("SHIPPED"));
        when(platformMapper.listOrderItems("SH1")).thenReturn(items("SN1"));
        when(reviewMapper.selectOne(any(Wrapper.class))).thenReturn(null);
        when(platformMapper.findStyleIdByNo(2L, "SN1")).thenReturn(88L);

        orchestrator.submit("c1", "SH1", "SN1", 4, "  版型不错  ", true);

        ArgumentCaptor<ShopReview> captor = ArgumentCaptor.forClass(ShopReview.class);
        verify(reviewMapper).insert(captor.capture());
        ShopReview r = captor.getValue();
        assertEquals("o1", r.getOrderId());
        assertEquals(2L, r.getTenantId());
        assertEquals(88L, r.getStyleId());
        assertEquals(4, r.getRating());
        assertEquals("版型不错", r.getContent());
        assertEquals(1, r.getAnonymous());
    }

    @Test
    @DisplayName("内容超长 → 拒绝")
    void contentTooLong() {
        when(platformMapper.findOrderForConsumer("SH1", "c1")).thenReturn(order("SHIPPED"));
        when(platformMapper.listOrderItems("SH1")).thenReturn(items("SN1"));
        assertThrows(IllegalArgumentException.class,
                () -> orchestrator.submit("c1", "SH1", "SN1", 5, "x".repeat(501), false));
    }

    @Test
    @DisplayName("评价汇总：均分 + 条数 + 列表")
    void styleReviews() {
        Map<String, Object> stat = new HashMap<>();
        stat.put("styleId", 88L);
        stat.put("cnt", 3);
        stat.put("avgRating", new BigDecimal("4.7"));
        when(platformMapper.listReviewStatsByStyleIds(List.of(88L))).thenReturn(List.of(stat));
        when(platformMapper.listReviewsByStyleId(88L, 20)).thenReturn(List.of(
                Map.of("rating", 5, "content", "很好", "nickname", "用户1234")));

        Map<String, Object> data = orchestrator.styleReviews(88L, null);

        assertEquals(new BigDecimal("4.7"), data.get("rating"));
        assertEquals(3, data.get("count"));
        assertEquals(1, ((List<?>) data.get("records")).size());
    }

    @Test
    @DisplayName("无评价时：均分 0、条数 0（前端显示「暂无评价」而不是 0 星）")
    void styleReviewsEmpty() {
        when(platformMapper.listReviewStatsByStyleIds(List.of(88L))).thenReturn(new ArrayList<>());
        when(platformMapper.listReviewsByStyleId(88L, 20)).thenReturn(new ArrayList<>());

        Map<String, Object> data = orchestrator.styleReviews(88L, null);

        assertEquals(0, data.get("count"));
        assertEquals(new BigDecimal("0.0"), data.get("rating"));
    }

    @Test
    @DisplayName("订单明细打标：已评价的行带 myRating/myReview")
    void markReviewed() {
        when(platformMapper.listReviewsByOrderNo("SH1")).thenReturn(List.of(
                Map.of("styleNo", "SN1", "rating", 5, "content", "满意")));
        List<Map<String, Object>> in = items("SN1", "SN2");

        List<Map<String, Object>> out = orchestrator.markReviewed("SH1", in);

        assertTrue((Boolean) out.get(0).get("reviewed"));
        assertEquals(5, out.get(0).get("myRating"));
        assertFalse((Boolean) out.get(1).get("reviewed"));
    }
}
