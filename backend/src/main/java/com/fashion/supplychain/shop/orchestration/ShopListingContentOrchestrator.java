package com.fashion.supplychain.shop.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.shop.entity.ShopListingContent;
import com.fashion.supplychain.shop.mapper.ShopListingContentMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 店铺商品「详情内容」编排器（D-782）
 *
 * <p>承载上架编辑页此前完全缺失的内容入口：轮播图、视频、品牌、手工尺码表、
 * 核心卖点、常见问题、价格说明。
 *
 * <p><b>口径纪律</b>：
 * <ul>
 *   <li>解析失败一律降级为空列表，**绝不把 JSON 原文抛给顾客**（D-777 同款教训）；</li>
 *   <li>写接口逐项做上限与去空白校验，避免把垃圾数据存进来；</li>
 *   <li>读写都强制按 tenantId 过滤，杜绝跨租户读到别人的商品内容。</li>
 * </ul>
 */
@Service
public class ShopListingContentOrchestrator {

    /** 轮播图上限：主流平台主图最多 5 张，留 2 张余量 */
    public static final int MAX_GALLERY = 10;
    /** 卖点上限 */
    public static final int MAX_POINTS = 8;
    /** 常见问题上限 */
    public static final int MAX_FAQ = 12;

    @Autowired
    private ShopListingContentMapper contentMapper;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 读取某款的详情内容；没有记录返回 null（由调用方按默认值处理） */
    public ShopListingContent find(Long tenantId, Long styleId) {
        if (tenantId == null || styleId == null) {
            return null;
        }
        return contentMapper.selectOne(new LambdaQueryWrapper<ShopListingContent>()
                .eq(ShopListingContent::getTenantId, tenantId)
                .eq(ShopListingContent::getStyleId, styleId)
                .last("LIMIT 1"));
    }

    /** 顾客端详情用：轮播图/视频/品牌/卖点/FAQ/价格说明，空值一律不给 */
    public Map<String, Object> toCustomerView(ShopListingContent c) {
        Map<String, Object> m = new LinkedHashMap<>();
        if (c == null) {
            return m;
        }
        putIfPresent(m, "videoUrl", c.getVideoUrl());
        putIfPresent(m, "brand", c.getBrand());
        putIfPresent(m, "priceNote", c.getPriceNote());
        List<String> gallery = parseStringList(c.getGalleryJson());
        if (!gallery.isEmpty()) {
            m.put("gallery", gallery);
        }
        List<String> points = parseStringList(c.getPointsJson());
        if (!points.isEmpty()) {
            m.put("points", points);
        }
        List<Map<String, String>> faq = parseFaq(c.getFaqJson());
        if (!faq.isEmpty()) {
            m.put("faq", faq);
        }
        return m;
    }

    private static void putIfPresent(Map<String, Object> m, String k, String v) {
        if (StringUtils.hasText(v)) {
            m.put(k, v.trim());
        }
    }

    private static List<String> parseStringList(String json) {
        if (!StringUtils.hasText(json)) {
            return List.of();
        }
        try {
            List<String> list = MAPPER.readValue(json, new TypeReference<List<String>>() {});
            List<String> out = new ArrayList<>();
            for (String s : list) {
                if (StringUtils.hasText(s)) {
                    out.add(s.trim());
                }
            }
            return out;
        } catch (Exception e) {
            // 解析失败降级为空，绝不把原始 JSON 透出去
            return List.of();
        }
    }

    private static List<Map<String, String>> parseFaq(String json) {
        if (!StringUtils.hasText(json)) {
            return List.of();
        }
        try {
            List<Map<String, String>> list =
                    MAPPER.readValue(json, new TypeReference<List<Map<String, String>>>() {});
            List<Map<String, String>> out = new ArrayList<>();
            for (Map<String, String> it : list) {
                String q = it == null ? null : it.get("q");
                String a = it == null ? null : it.get("a");
                if (StringUtils.hasText(q) && StringUtils.hasText(a)) {
                    Map<String, String> row = new LinkedHashMap<>();
                    row.put("q", q.trim());
                    row.put("a", a.trim());
                    out.add(row);
                }
            }
            return out;
        } catch (Exception e) {
            return List.of();
        }
    }

    /** 管理端读：返回完整内容，供编辑抽屉回填 */
    public Map<String, Object> loadForEdit(Long tenantId, Long styleId) {
        ShopListingContent c = find(tenantId, styleId);
        Map<String, Object> m = new LinkedHashMap<>();
        if (c == null) {
            m.put("gallery", List.of());
            m.put("points", List.of());
            m.put("faq", List.of());
            m.put("videoUrl", null);
            m.put("brand", null);
            m.put("priceNote", null);
            m.put("sizeChart", null);
            return m;
        }
        m.put("gallery", parseStringList(c.getGalleryJson()));
        m.put("points", parseStringList(c.getPointsJson()));
        m.put("faq", parseFaq(c.getFaqJson()));
        m.put("videoUrl", c.getVideoUrl());
        m.put("brand", c.getBrand());
        m.put("priceNote", c.getPriceNote());
        m.put("sizeChart", c.getSizeChart());
        return m;
    }

    /**
     * 保存。
     *
     * <p>整份覆盖写：编辑抽屉每次保存提交的就是这一款的完整内容，
     * 「部分更新」在这里没有语义，只会带来「清空了一个字段却以为没动」的困惑。
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean save(Long tenantId, Long styleId, Map<String, Object> body) {
        if (tenantId == null || styleId == null) {
            return false;
        }
        ShopListingContent c = find(tenantId, styleId);
        boolean isNew = (c == null);
        if (isNew) {
            c = new ShopListingContent();
            c.setTenantId(tenantId);
            c.setStyleId(styleId);
        }
        c.setGalleryJson(toJson(capList(body.get("gallery"), MAX_GALLERY)));
        c.setPointsJson(toJson(capList(body.get("points"), MAX_POINTS)));
        c.setFaqJson(toFaqJson(capFaq(body.get("faq"), MAX_FAQ)));
        c.setVideoUrl(trimToNull(body.get("videoUrl")));
        c.setBrand(trimToNull(body.get("brand")));
        c.setPriceNote(trimToNull(body.get("priceNote")));
        c.setSizeChart(trimToNull(body.get("sizeChart")));
        return isNew ? contentMapper.insert(c) > 0 : contentMapper.updateById(c) > 0;
    }

    private static String trimToNull(Object v) {
        String s = v == null ? null : String.valueOf(v).trim();
        return StringUtils.hasText(s) ? s : null;
    }

    private static List<String> capList(Object v, int max) {
        List<String> raw = toStringList(v);
        List<String> out = new ArrayList<>();
        for (String s : raw) {
            if (StringUtils.hasText(s)) {
                String t = s.trim();
                if (!out.contains(t)) { // 去重：同一张图重复上传过不该出现两次
                    out.add(t);
                }
            }
            if (out.size() >= max) {
                break;
            }
        }
        return out;
    }

    private static List<Map<String, String>> capFaq(Object v, int max) {
        List<Map<String, String>> out = new ArrayList<>();
        if (!(v instanceof List<?> raw)) {
            return out;
        }
        for (Object o : raw) {
            if (!(o instanceof Map<?, ?> m)) {
                continue;
            }
            String q = m.get("q") == null ? null : String.valueOf(m.get("q")).trim();
            String a = m.get("a") == null ? null : String.valueOf(m.get("a")).trim();
            if (StringUtils.hasText(q) && StringUtils.hasText(a)) {
                Map<String, String> row = new LinkedHashMap<>();
                row.put("q", q);
                row.put("a", a);
                out.add(row);
            }
            if (out.size() >= max) {
                break;
            }
        }
        return out;
    }

    private static List<String> toStringList(Object v) {
        List<String> out = new ArrayList<>();
        if (v instanceof List<?> raw) {
            for (Object o : raw) {
                if (o != null) {
                    out.add(String.valueOf(o));
                }
            }
        } else if (v instanceof String s && StringUtils.hasText(s)) {
            // 兼容逗号分隔
            for (String part : s.split(",")) {
                out.add(part);
            }
        }
        return out;
    }

    private static String toJson(List<String> list) {
        if (list == null || list.isEmpty()) {
            return null;
        }
        try {
            return MAPPER.writeValueAsString(list);
        } catch (Exception e) {
            return null;
        }
    }

    private static String toFaqJson(List<Map<String, String>> list) {
        if (list == null || list.isEmpty()) {
            return null;
        }
        try {
            return MAPPER.writeValueAsString(list);
        } catch (Exception e) {
            return null;
        }
    }

    /** 当前登录租户（管理端用） */
    public Long currentTenantId() {
        return UserContext.tenantId();
    }
}