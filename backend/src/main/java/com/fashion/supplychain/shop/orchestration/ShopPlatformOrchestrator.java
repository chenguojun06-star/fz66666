package com.fashion.supplychain.shop.orchestration;

import com.fashion.supplychain.shop.mapper.ShopPlatformMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 平台级商城（公共商品池）编排（P0）。
 *
 * <p>把 D-763 的「一租户一个小店」升级为**平台方运营的公共商城**：
 * 所有租户上架的款式汇到一个商品池，C 端在一个首页里跨店浏览/搜索/按类目筛选，
 * 看中后跳进对应店铺下单（一单仍只含一个店铺 —— 资金各租户直收，平台不抽成）。
 *
 * <p><b>只读、只展示</b>：本编排器不写任何业务数据，且刻意不返回成本/供应商等内部字段；
 * 价格与库存以 SKU 售价/库存为准，与店铺页口径一致。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShopPlatformOrchestrator {

    /** 首页精选商品条数 */
    private static final int FEATURED_SIZE = 12;
    /** 单页最大条数（防刷） */
    private static final int MAX_PAGE_SIZE = 60;

    private final ShopPlatformMapper platformMapper;

    /**
     * 平台首页数据：店铺列表 + 类目 + 精选商品 + 概览数字。
     */
    public Map<String, Object> home() {
        Map<String, Object> data = new LinkedHashMap<>();
        List<Map<String, Object>> shops = normalizeShops(platformMapper.listShops());
        data.put("shops", shops);
        data.put("categories", platformMapper.listCategories());
        data.put("featured", buildProductRows(
                platformMapper.pageListedStyles(null, null, 0, FEATURED_SIZE)));
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("shopCount", shops.size());
        stats.put("listedStyleCount", platformMapper.countListedStyles(null, null));
        data.put("stats", stats);
        return data;
    }

    /** 跨店商品池分页（关键字 + 类目） */
    public Map<String, Object> products(int page, int pageSize, String keyword, String category) {
        int p = Math.max(1, page);
        int size = Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE);
        String kw = StringUtils.hasText(keyword) ? keyword.trim() : null;
        String cat = StringUtils.hasText(category) ? category.trim() : null;

        long total = platformMapper.countListedStyles(kw, cat);
        List<Map<String, Object>> rows = buildProductRows(
                platformMapper.pageListedStyles(kw, cat, (p - 1) * size, size));

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("records", rows);
        resp.put("total", total);
        resp.put("page", p);
        resp.put("pageSize", size);
        return resp;
    }

    /** 平台店铺列表 */
    public List<Map<String, Object>> shops() {
        return normalizeShops(platformMapper.listShops());
    }

    /** 平台商品池类目 */
    public List<Map<String, Object>> categories() {
        return platformMapper.listCategories();
    }

    /** 平台只读总览（平台超管用） */
    public Map<String, Object> overview() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("counters", platformMapper.platformOverview());
        data.put("shops", normalizeShops(platformMapper.listShops()));
        data.put("recentOrders", platformMapper.listRecentOrders(20));
        return data;
    }

    // ── 内部 ────────────────────────────────────────────────────────────────

    /**
     * 商品池行 → 展示行：补齐店铺 slug（未建店配置时按 t{tenantId} 兜底）、
     * 用 SKU 聚合出「最低价 / 总可售 / 颜色数」。
     */
    private List<Map<String, Object>> buildProductRows(List<Map<String, Object>> styles) {
        List<Map<String, Object>> rows = new ArrayList<>();
        if (styles == null || styles.isEmpty()) {
            return rows;
        }
        List<Long> styleIds = new ArrayList<>();
        for (Map<String, Object> s : styles) {
            Object id = s.get("styleId");
            if (id != null) {
                styleIds.add(Long.valueOf(String.valueOf(id)));
            }
        }
        Map<Long, List<Map<String, Object>>> skusByStyle = new HashMap<>();
        if (!styleIds.isEmpty()) {
            for (Map<String, Object> sku : platformMapper.listSkusByStyleIds(styleIds)) {
                Object sid = sku.get("styleId");
                if (sid == null) {
                    continue;
                }
                skusByStyle.computeIfAbsent(Long.valueOf(String.valueOf(sid)), k -> new ArrayList<>()).add(sku);
            }
        }

        // P2：评价统计（均分 + 条数）——一次批量查，避免逐行 N+1
        Map<Long, Map<String, Object>> reviewStats = new HashMap<>();
        if (!styleIds.isEmpty()) {
            for (Map<String, Object> st : platformMapper.listReviewStatsByStyleIds(styleIds)) {
                Object sid = st.get("styleId");
                if (sid != null) {
                    reviewStats.put(Long.valueOf(String.valueOf(sid)), st);
                }
            }
        }

        for (Map<String, Object> s : styles) {
            Map<String, Object> row = new LinkedHashMap<>(s);
            Long styleId = s.get("styleId") == null ? null : Long.valueOf(String.valueOf(s.get("styleId")));
            List<Map<String, Object>> skus = styleId == null
                    ? List.of() : skusByStyle.getOrDefault(styleId, List.of());

            BigDecimal minPrice = null;
            int totalStock = 0;
            java.util.Set<String> colors = new java.util.HashSet<>();
            for (Map<String, Object> sku : skus) {
                Object priceObj = sku.get("salesPrice");
                if (priceObj != null) {
                    BigDecimal price = new BigDecimal(String.valueOf(priceObj));
                    if (minPrice == null || price.compareTo(minPrice) < 0) {
                        minPrice = price;
                    }
                }
                Object stockObj = sku.get("stockQuantity");
                totalStock += stockObj == null ? 0 : Integer.parseInt(String.valueOf(stockObj));
                Object color = sku.get("color");
                if (color != null && StringUtils.hasText(String.valueOf(color))) {
                    colors.add(String.valueOf(color));
                }
            }
            row.put("minPrice", minPrice);
            row.put("totalStock", totalStock);
            row.put("colorCount", colors.size());
            // P2：没有评价时给 0 / 0，前端据此显示「暂无评价」而不是 0 星
            Map<String, Object> rs = styleId == null ? null : reviewStats.get(styleId);
            row.put("rating", rs == null || rs.get("avgRating") == null
                    ? null : new BigDecimal(String.valueOf(rs.get("avgRating"))));
            row.put("reviewCount", rs == null || rs.get("cnt") == null
                    ? 0 : Integer.parseInt(String.valueOf(rs.get("cnt"))));
            // 未建店铺配置的租户：slug 兜底为 t{tenantId}，保证「进店」链接可用
            if (!StringUtils.hasText((String) row.get("slug")) && row.get("tenantId") != null) {
                row.put("slug", "t" + row.get("tenantId"));
            }
            if (!StringUtils.hasText((String) row.get("shopName"))) {
                row.put("shopName", "未命名店铺");
            }
            rows.add(row);
        }
        return rows;
    }

    /** 店铺行：统一字段类型（enabled 转 boolean）并过滤掉空租户的脏数据 */
    private List<Map<String, Object>> normalizeShops(List<Map<String, Object>> shops) {
        List<Map<String, Object>> rows = new ArrayList<>();
        if (shops == null) {
            return rows;
        }
        for (Map<String, Object> s : shops) {
            if (s.get("slug") == null || s.get("tenantId") == null) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>(s);
            row.put("enabled", "1".equals(String.valueOf(s.get("enabled")))
                    || Boolean.TRUE.equals(s.get("enabled")));
            Object cnt = s.get("productCount");
            row.put("productCount", cnt == null ? 0 : Integer.parseInt(String.valueOf(cnt)));
            rows.add(row);
        }
        return rows;
    }
}
