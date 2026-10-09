package com.fashion.supplychain.shop.orchestration;

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

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * P0 平台商品池单测：跨店聚合（最低价 / 总可售 / 颜色数）、slug 兜底、脏店铺过滤、分页夹取。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ShopPlatformOrchestratorTest {

    @Mock
    private ShopPlatformMapper platformMapper;

    @InjectMocks
    private ShopPlatformOrchestrator orchestrator;

    private Map<String, Object> style(long id, Long tenantId, String slug) {
        Map<String, Object> m = new HashMap<>();
        m.put("styleId", id);
        m.put("tenantId", tenantId);
        m.put("styleNo", "SN" + id);
        m.put("styleName", "款" + id);
        m.put("cover", "https://img/" + id + ".jpg");
        m.put("slug", slug);
        m.put("shopName", slug == null ? null : "店" + slug);
        return m;
    }

    private Map<String, Object> sku(long styleId, String color, String price, int stock) {
        Map<String, Object> m = new HashMap<>();
        m.put("styleId", styleId);
        m.put("color", color);
        m.put("salesPrice", price == null ? null : new BigDecimal(price));
        m.put("stockQuantity", stock);
        return m;
    }

    @Test
    @DisplayName("商品池：按 SKU 聚合最低价 / 总可售 / 颜色数")
    void aggregatesSku() {
        when(platformMapper.countListedStyles(null, null)).thenReturn(2L);
        when(platformMapper.pageListedStyles(eq(null), eq(null), any(), eq(0), anyInt()))
                .thenReturn(List.of(style(1L, 2L, "t2")));
        when(platformMapper.listSkusByStyleIds(anyList())).thenReturn(List.of(
                sku(1L, "黑", "99.00", 3),
                sku(1L, "黑", "89.50", 2),
                sku(1L, "白", "120.00", 5)));

        Map<String, Object> resp = orchestrator.products(1, 20, null, null, null);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) resp.get("records");
        assertEquals(1, rows.size());
        assertEquals(new BigDecimal("89.50"), rows.get(0).get("minPrice"));
        assertEquals(10, rows.get(0).get("totalStock"));
        assertEquals(2, rows.get(0).get("colorCount"));
        assertEquals(2L, resp.get("total"));
    }

    @Test
    @DisplayName("商品池：租户未建店铺配置时 slug 兜底为 t{tenantId}，店名兜底")
    void slugFallback() {
        when(platformMapper.countListedStyles(any(), any())).thenReturn(1L);
        when(platformMapper.pageListedStyles(any(), any(), any(), anyInt(), anyInt()))
                .thenReturn(List.of(style(7L, 106L, null)));
        when(platformMapper.listSkusByStyleIds(anyList())).thenReturn(new ArrayList<>());

        Map<String, Object> resp = orchestrator.products(1, 20, null, null, null);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) resp.get("records");

        assertEquals("t106", rows.get(0).get("slug"));
        assertEquals("未命名店铺", rows.get(0).get("shopName"));
    }

    @Test
    @DisplayName("商品池：无 SKU 时最低价为 null、可售 0（不抛异常）")
    void noSkuNoPrice() {
        when(platformMapper.countListedStyles(any(), any())).thenReturn(1L);
        when(platformMapper.pageListedStyles(any(), any(), any(), anyInt(), anyInt()))
                .thenReturn(List.of(style(9L, 2L, "t2")));
        when(platformMapper.listSkusByStyleIds(anyList())).thenReturn(new ArrayList<>());

        Map<String, Object> resp = orchestrator.products(1, 20, null, null, null);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) resp.get("records");

        assertEquals(null, rows.get(0).get("minPrice"));
        assertEquals(0, rows.get(0).get("totalStock"));
    }

    @Test
    @DisplayName("商品池：pageSize 超过上限被夹取到 60，page<1 归一到 1")
    void pageClamp() {
        when(platformMapper.countListedStyles(any(), any())).thenReturn(0L);
        when(platformMapper.pageListedStyles(any(), any(), any(), anyInt(), anyInt())).thenReturn(new ArrayList<>());

        Map<String, Object> resp = orchestrator.products(0, 999, null, null, null);

        ArgumentCaptor<Integer> size = ArgumentCaptor.forClass(Integer.class);
        ArgumentCaptor<Integer> offset = ArgumentCaptor.forClass(Integer.class);
        verify(platformMapper).pageListedStyles(any(), any(), any(), offset.capture(), size.capture());
        assertEquals(0, offset.getValue());
        assertEquals(60, size.getValue());
        assertEquals(1, resp.get("page"));
        assertEquals(60, resp.get("pageSize"));
    }

    @Test
    @DisplayName("店铺列表：enabled 归一为布尔、商品数转 int、缺 slug 的脏行被丢弃")
    void normalizeShops() {
        Map<String, Object> ok = new HashMap<>();
        ok.put("tenantId", 2L);
        ok.put("slug", "t2");
        ok.put("shopName", "东方制衣厂");
        ok.put("enabled", 1);
        ok.put("productCount", "3");

        Map<String, Object> dirty = new HashMap<>();
        dirty.put("tenantId", 3L);
        dirty.put("slug", null);

        when(platformMapper.listShops()).thenReturn(List.of(ok, dirty));

        List<Map<String, Object>> shops = orchestrator.shops();

        assertEquals(1, shops.size());
        assertTrue((Boolean) shops.get(0).get("enabled"));
        assertEquals(3, shops.get(0).get("productCount"));
    }

    @Test
    @DisplayName("首页：店铺数取归一后的条数，在架款式数来自跨租户计数")
    void homeStats() {
        Map<String, Object> s = new HashMap<>();
        s.put("tenantId", 2L);
        s.put("slug", "t2");
        s.put("shopName", "店");
        s.put("enabled", 0);
        when(platformMapper.listShops()).thenReturn(List.of(s));
        when(platformMapper.listCategories()).thenReturn(List.of());
        when(platformMapper.pageListedStyles(any(), any(), any(), anyInt(), anyInt())).thenReturn(new ArrayList<>());
        when(platformMapper.countListedStyles(null, null)).thenReturn(15L);

        Map<String, Object> home = orchestrator.home();

        @SuppressWarnings("unchecked")
        Map<String, Object> stats = (Map<String, Object>) home.get("stats");
        assertEquals(1, stats.get("shopCount"));
        assertEquals(15L, stats.get("listedStyleCount"));
        assertFalse((Boolean) ((Map<String, Object>) ((List<?>) home.get("shops")).get(0)).get("enabled"));
    }

    @Test
    @DisplayName("平台总览：包含计数 / 店铺 / 最近订单三段")
    void overview() {
        when(platformMapper.platformOverview()).thenReturn(Map.of("shopCount", 2, "orderCount", 5));
        when(platformMapper.listShops()).thenReturn(new ArrayList<>());
        when(platformMapper.listRecentOrders(20)).thenReturn(List.of(Map.of("orderNo", "SH1")));

        Map<String, Object> ov = orchestrator.overview();

        assertTrue(ov.containsKey("counters"));
        assertTrue(ov.containsKey("shops"));
        assertEquals(1, ((List<?>) ov.get("recentOrders")).size());
    }

    @Test
    @DisplayName("排序：白名单外的值一律回落到最新，不把用户输入当 SQL 语义")
    void sortWhitelist() {
        when(platformMapper.countListedStyles(any(), any())).thenReturn(0L);
        when(platformMapper.pageListedStyles(any(), any(), any(), anyInt(), anyInt()))
                .thenReturn(new ArrayList<>());

        ArgumentCaptor<String> sort = ArgumentCaptor.forClass(String.class);

        orchestrator.products(1, 20, null, null, "price_asc");
        verify(platformMapper).pageListedStyles(any(), any(), sort.capture(), anyInt(), anyInt());
        assertEquals("price_asc", sort.getValue());

        Map<String, Object> resp = orchestrator.products(1, 20, null, null, "'; DROP TABLE x; --");
        assertEquals("newest", resp.get("sort"));
    }
}
