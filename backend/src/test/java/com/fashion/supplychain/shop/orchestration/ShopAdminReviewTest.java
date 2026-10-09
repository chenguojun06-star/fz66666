package com.fashion.supplychain.shop.orchestration;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.shop.entity.ShopReview;
import com.fashion.supplychain.shop.mapper.ShopReviewMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

/**
 * P2 商家侧评价查看单测（评价此前只有 C 端写入，商家看不到任何一条）。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ShopAdminReviewTest {

    @Mock
    private ShopReviewMapper shopReviewMapper;

    @InjectMocks
    private ShopAdminOrchestrator orchestrator;

    @BeforeEach
    void setTenant() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(2L);
        ctx.setUserId("u1");
        ctx.setUsername("店主");
        UserContext.set(ctx);
    }

    @AfterEach
    void clearTenant() {
        UserContext.clear();
    }

    private ShopReview review(int rating, String styleNo, int anonymous) {
        ShopReview r = new ShopReview();
        r.setId("r-" + rating + "-" + styleNo);
        r.setOrderNo("SH1");
        r.setStyleNo(styleNo);
        r.setRating(rating);
        r.setContent("不错");
        r.setAnonymous(anonymous);
        r.setConsumerId("secret-consumer-id");
        r.setCreateTime(LocalDateTime.now());
        return r;
    }

    @Test
    @DisplayName("评价分页：不返回 consumer_id（对商家无意义且属隐私）")
    void reviewsHideConsumerId() {
        Page<ShopReview> page = new Page<>(1, 20);
        page.setRecords(List.of(review(5, "SN1", 1), review(4, "SN2", 0)));
        page.setTotal(2);
        when(shopReviewMapper.selectPage(any(), any(Wrapper.class))).thenReturn(page);

        Map<String, Object> data = orchestrator.reviews(1, 20, null, null);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) data.get("records");
        assertEquals(2, rows.size());
        assertEquals(2L, data.get("total"));
        assertFalse(rows.get(0).containsKey("consumerId"));
        assertFalse(rows.get(0).containsKey("tenantId"));
        assertEquals(Boolean.TRUE, rows.get(0).get("anonymous"));
        assertEquals(5, rows.get(0).get("rating"));
    }

    @Test
    @DisplayName("评价概览：均分保留一位小数 + 各星级分布")
    void summary() {
        List<Map<String, Object>> counts = new ArrayList<>();
        counts.add(row(5, 3));
        counts.add(row(4, 1));
        counts.add(row(1, 1));
        when(shopReviewMapper.countByRating(anyLong())).thenReturn(counts);

        Map<String, Object> data = orchestrator.reviewSummary();

        assertEquals(5L, data.get("total"));
        // (5*3 + 4*1 + 1*1) / 5 = 20 / 5 = 4.0
        assertEquals(new BigDecimal("4.0"), data.get("avgRating"));
        @SuppressWarnings("unchecked")
        Map<String, Integer> dist = (Map<String, Integer>) data.get("distribution");
        assertEquals(3, dist.get("5星"));
        assertEquals(1, dist.get("4星"));
        assertEquals(0, dist.get("3星"));
        assertEquals(1, dist.get("1星"));
    }

    @Test
    @DisplayName("没有任何评价：均分 0.0、总数 0（不抛异常）")
    void summaryEmpty() {
        when(shopReviewMapper.countByRating(anyLong())).thenReturn(new ArrayList<>());
        Map<String, Object> data = orchestrator.reviewSummary();
        assertEquals(0L, data.get("total"));
        assertEquals(new BigDecimal("0.0"), data.get("avgRating"));
    }

    @Test
    @DisplayName("未登录（无租户上下文）→ 明确拒绝，不返回全量数据")
    void requireLogin() {
        UserContext.clear();
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.reviews(1, 20, null, null));
        assertTrue(e.getMessage().contains("登录"));
    }

    private Map<String, Object> row(int rating, int cnt) {
        Map<String, Object> m = new HashMap<>();
        m.put("rating", rating);
        m.put("cnt", cnt);
        return m;
    }
}
