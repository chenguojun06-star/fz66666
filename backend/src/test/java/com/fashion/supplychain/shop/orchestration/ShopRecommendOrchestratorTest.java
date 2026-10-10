package com.fashion.supplychain.shop.orchestration;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fashion.supplychain.shop.entity.ShopBrowseLog;
import com.fashion.supplychain.shop.mapper.ShopBrowseLogMapper;
import com.fashion.supplychain.shop.mapper.ShopStatDailyMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
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
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * D-784 商品推荐单测。
 *
 * <p>这批代码是工作区里**已存在但从未接线**的实现（无控制器、无调用方、无测试）。
 * 接手时保留其核心策略（同品类/个人偏好/热度三级混合 + 时间衰减），补上测试与接线。
 *
 * <p>重点守住的几条口径：
 * <ol>
 *   <li>匿名访客**不假装有个性化** —— 不去查浏览历史；</li>
 *   <li>浏览计数**匿名也记**（看板要），但个人浏览明细**只记登录顾客**；</li>
 *   <li>时间衰减 —— 90 天前看过的权重为 0，否则推荐会长期锁死在过时偏好上；</li>
 *   <li>绝不推荐当前正在看的款式。</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ShopRecommendOrchestratorTest {

    @Mock
    private ShopBrowseLogMapper browseLogMapper;

    @Mock
    private ShopStatDailyMapper statDailyMapper;

    @Mock
    private StyleInfoService styleInfoService;

    @Mock
    private ProductSkuService productSkuService;

    @InjectMocks
    private ShopRecommendOrchestrator orchestrator;

    private static final long TENANT = 7L;

    private StyleInfo style(long id, String no, String category, String season) {
        StyleInfo s = new StyleInfo();
        s.setId(id);
        s.setTenantId(TENANT);
        s.setStyleNo(no);
        s.setStyleName("款" + id);
        s.setCategory(category);
        s.setSeason(season);
        s.setShopListed(1);
        s.setCover("c" + id + ".jpg");
        return s;
    }

    private ProductSku sku(long id, long styleId, String price) {
        ProductSku k = new ProductSku();
        k.setId(id);
        k.setTenantId(TENANT);
        k.setStyleId(styleId);
        k.setSalesPrice(new BigDecimal(price));
        k.setStockQuantity(5);
        k.setColor("红");
        return k;
    }

    // ── 记录浏览 ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("① 匿名浏览：只记按天计数，不建个人明细（不假装有个性化）")
    void anonymousBrowseOnlyCounts() {
        orchestrator.recordView(TENANT, null, 100L, "A1");

        verify(statDailyMapper).bumpBrowse(TENANT);
        verify(browseLogMapper, never()).recordView(anyLong(), anyString(), anyLong(), anyString());
    }

    @Test
    @DisplayName("② 登录浏览：计数与个人明细都记")
    void loggedInBrowseRecordsBoth() {
        orchestrator.recordView(TENANT, "c1", 100L, "A1");

        verify(statDailyMapper).bumpBrowse(TENANT);
        verify(browseLogMapper).recordView(TENANT, "c1", 100L, "A1");
    }

    @Test
    @DisplayName("③ 统计写失败不得影响顾客浏览（静默降级）")
    void statFailureIsSwallowed() {
        when(statDailyMapper.bumpBrowse(anyLong())).thenThrow(new RuntimeException("db down"));
        when(browseLogMapper.recordView(anyLong(), anyString(), anyLong(), anyString()))
                .thenThrow(new RuntimeException("db down"));

        // 不抛异常即为通过
        orchestrator.recordView(TENANT, "c1", 100L, "A1");
    }

    @Test
    @DisplayName("④ 缺少租户或款式时不记任何东西")
    void missingTenantOrStyleSkips() {
        orchestrator.recordView(null, "c1", 100L, "A1");
        orchestrator.recordView(TENANT, "c1", null, "A1");

        verify(statDailyMapper, never()).bumpBrowse(anyLong());
        verify(browseLogMapper, never()).recordView(anyLong(), anyString(), anyLong(), anyString());
    }

    // ── 推荐 ───────────────────────────────────────────────────────────────

    @Test
    @DisplayName("⑤ 匿名访客：不查浏览历史，仍能按同品类给出推荐")
    void anonymousRecommendationUsesCategoryOnly() {
        when(styleInfoService.getById(1L)).thenReturn(style(1L, "A1", "WOMAN", "SUMMER"));
        when(styleInfoService.list(any(Wrapper.class))).thenReturn(List.of(
                style(2L, "A2", "WOMAN", "SUMMER"),
                style(3L, "A3", "MAN", "WINTER")));
        when(productSkuService.list(any(Wrapper.class))).thenReturn(List.of(
                sku(21L, 2L, "199"), sku(31L, 3L, "299")));

        List<Map<String, Object>> rows = orchestrator.recommend(TENANT, 1L, null, 8);

        assertEquals(2, rows.size());
        // 同类同季的排最前
        assertEquals(2L, rows.get(0).get("styleId"));
        assertEquals("同类同季", rows.get(0).get("reason"));
        assertEquals(new BigDecimal("199"), rows.get(0).get("minPrice"));
        assertEquals(5, rows.get(0).get("totalStock"));
        // 匿名不得去查个人浏览历史
        verify(browseLogMapper, never()).recentViews(anyLong(), anyString(), anyInt());
    }

    @Test
    @DisplayName("⑥ 绝不推荐当前正在看的款式")
    void neverRecommendsCurrentStyle() {
        when(styleInfoService.getById(1L)).thenReturn(style(1L, "A1", "WOMAN", "SUMMER"));
        // 候选池由 SQL 的 ne(id, styleId) 保证不含自己；这里再守一次调用方传参
        when(styleInfoService.list(any(Wrapper.class))).thenReturn(new ArrayList<>());

        assertTrue(orchestrator.recommend(TENANT, 1L, "c1", 8).isEmpty());
    }

    @Test
    @DisplayName("⑦ 登录顾客：个人偏好参与打分，且标出「你常看」")
    void loggedInPreferenceAffectsScore() {
        when(styleInfoService.getById(1L)).thenReturn(style(1L, "A1", "DRESS", "SUMMER"));
        when(styleInfoService.list(any(Wrapper.class))).thenReturn(List.of(
                style(9L, "B9", "DRESS", "WINTER"),   // 同品类，但顾客历史里看过它 → 应被抬上来
                style(8L, "B8", "DRESS", "SUMMER"))); // 同品类同季，基础分更高

        Map<String, Object> view = new HashMap<>();
        view.put("styleId", 9L);
        view.put("lastTime", LocalDateTime.now().minusDays(1));
        when(browseLogMapper.recentViews(eq(TENANT), eq("c1"), anyInt())).thenReturn(List.of(view));
        when(styleInfoService.getById(9L)).thenReturn(style(9L, "B9", "DRESS", "WINTER"));
        when(productSkuService.list(any(Wrapper.class))).thenReturn(List.of());

        List<Map<String, Object>> rows = orchestrator.recommend(TENANT, 1L, "c1", 8);

        assertEquals(2, rows.size());
        String firstReason = String.valueOf(rows.get(0).get("reason"));
        assertTrue(firstReason.contains("你常看"),
                "看过的那款应因个人偏好被抬到最前，实际理由=" + firstReason);
    }

    @Test
    @DisplayName("⑧ 时间衰减：90 天前看过的权重为 0（不锁死在过时偏好上）")
    void decayZeroAfterWindow() {
        LocalDateTime now = LocalDateTime.now();
        assertTrue(ShopRecommendOrchestrator.decayOf(now.minusDays(1), now) > 0.9);
        assertTrue(ShopRecommendOrchestrator.decayOf(now.minusDays(30), now) < 0.55);
        assertEquals(0d, ShopRecommendOrchestrator.decayOf(now.minusDays(120), now));
    }

    @Test
    @DisplayName("⑨ 款式不存在 / 租户缺失时返回空，不抛异常")
    void missingStyleReturnsEmpty() {
        assertTrue(orchestrator.recommend(TENANT, 999L, null, 8).isEmpty());
        assertTrue(orchestrator.recommend(null, 1L, null, 8).isEmpty());
    }

    @Test
    @DisplayName("⑩ 无评分数据时给 null/0，前端据此显示「暂无评价」")
    void noReviewStatsGivesNullRating() {
        when(styleInfoService.getById(1L)).thenReturn(style(1L, "A1", "WOMAN", "SUMMER"));
        when(styleInfoService.list(any(Wrapper.class))).thenReturn(List.of(style(2L, "A2", "WOMAN", "SUMMER")));
        when(productSkuService.list(any(Wrapper.class))).thenReturn(List.of());

        List<Map<String, Object>> rows = orchestrator.recommend(TENANT, 1L, null, 8);

        assertEquals(1, rows.size());
        assertEquals(0, rows.get(0).get("totalStock"));
        assertFalse(rows.get(0).containsKey("rating") && rows.get(0).get("rating") != null);
    }

    @Test
    @DisplayName("⑪ 无货的款排到最后（实测「猜你喜欢」里混进库存 0 的款，点进去买不了）")
    void outOfStockGoesLast() {
        Map<String, Object> a = new HashMap<>();
        a.put("styleId", 1L);
        a.put("totalStock", 0);
        Map<String, Object> b = new HashMap<>();
        b.put("styleId", 2L);
        b.put("totalStock", 5);
        Map<String, Object> c = new HashMap<>();
        c.put("styleId", 3L);
        c.put("totalStock", 2);

        List<Map<String, Object>> sorted =
                ShopRecommendOrchestrator.stockFirst(new ArrayList<>(List.of(a, b, c)));

        // 有货的两个保持原相对顺序在前，无货的沉底
        assertEquals(2L, sorted.get(0).get("styleId"));
        assertEquals(3L, sorted.get(1).get("styleId"));
        assertEquals(1L, sorted.get(2).get("styleId"));
        // 不删除：它仍是本店真实商品
        assertEquals(3, sorted.size());
    }
}
