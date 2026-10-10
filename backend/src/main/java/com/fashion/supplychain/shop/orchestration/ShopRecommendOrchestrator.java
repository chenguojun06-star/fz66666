package com.fashion.supplychain.shop.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.shop.entity.ShopBrowseLog;
import com.fashion.supplychain.shop.mapper.ShopBrowseLogMapper;
import com.fashion.supplychain.shop.mapper.ShopStatDailyMapper;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 店铺商品推荐（D-784）
 *
 * <p><b>用户诉求</b>：「详情页 到底部的时候 是不是有一些推荐 根据用户的这些 喜欢的」。
 * 实测顾客端推荐代码 0 处、后端也没有任何推荐逻辑 —— 详情页到最底是死胡同。
 *
 * <p><b>推荐策略：从「同品类」到「个人偏好」再到「热销兜底」，逐级放宽</b>。
 * 单一维度都会失真：
 * <ul>
 *   <li>只按同品类 → 千人一面，跟没个性化一样；</li>
 *   <li>只按个人历史 → 新顾客直接开天窗（没历史）；</li>
 *   <li>只按热销 → 老顾客一直看同一批款，逛不出新东西。</li>
 * </ul>
 * 三者混合后：<b>同品类保证「相关」，个人偏好保证「像是他喜欢的」，热销保证「不空」</b>。
 *
 * <p><b>口径纪律</b>：
 * <ul>
 *   <li>浏览历史的权重按<b>时间衰减</b> —— 三周前看的和昨天看的权重不该一样，
 *       否则推荐会长期锁死在顾客早已放弃的偏好上；</li>
 *   <li>匿名访客没有个人历史，<b>不假装有个性化</b>，直接走同品类 + 热销；</li>
 *   <li>候选不足时用热销补齐，但补进来的要标记来源，让前端能说清「为什么推这个」；</li>
 *   <li>绝不推荐当前正在看的款式，也不推荐没上架的。</li>
 * </ul>
 */
@Slf4j
@Service
public class ShopRecommendOrchestrator {

    /** 默认推荐条数 */
    public static final int DEFAULT_LIMIT = 8;
    /** 参与计算偏好的最近浏览条数：再多也说明不了「当前」偏好 */
    private static final int HISTORY_LIMIT = 50;
    /** 参与计算的浏览记录新鲜期 */
    private static final Duration HISTORY_WINDOW = Duration.ofDays(90);
    /** 时间衰减半衰期：30 天前看过的，权重减半 */
    private static final long HALF_LIFE_DAYS = 30;

    @Autowired
    private ShopBrowseLogMapper browseLogMapper;

    @Autowired
    private ShopStatDailyMapper statDailyMapper;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private ProductSkuService productSkuService;

    /**
     * 记一次浏览。
     *
     * <p>两件事，缺一不可：
     * <ol>
     *   <li><b>按天计数</b>（匿名也记）—— 数据看板的「浏览」要用，匿名访客也是真实访问；</li>
     *   <li><b>按顾客+款式合并记一份</b>（仅登录顾客）—— 个性化推荐要用。
     *       匿名访客没有稳定身份，记下来既无法跨设备复用，又会变成清理不掉的垃圾数据，
     *       所以匿名只计数、不建档。</li>
     * </ol>
     */
    public void recordView(Long tenantId, String consumerId, Long styleId, String styleNo) {
        if (tenantId == null || styleId == null) {
            return;
        }
        try {
            statDailyMapper.bumpBrowse(tenantId);
        } catch (Exception e) {
            // 统计记不下来不该影响顾客浏览，静默降级
            log.debug("[ShopRecommend] 浏览计数失败 tenant={} err={}", tenantId, e.getMessage());
        }
        if (!StringUtils.hasText(consumerId)) {
            return;
        }
        try {
            browseLogMapper.recordView(tenantId, consumerId, styleId, styleNo);
        } catch (Exception e) {
            log.debug("[ShopRecommend] 浏览明细写入失败 tenant={} err={}", tenantId, e.getMessage());
        }
    }

    /**
     * 为某款式推荐相关商品。
     *
     * @param tenantId   店铺租户
     * @param styleId    当前款式
     * @param consumerId 当前顾客；为空按匿名处理
     * @param limit      条数
     */
    public List<Map<String, Object>> recommend(Long tenantId, Long styleId,
                                               String consumerId, int limit) {
        int size = limit <= 0 ? DEFAULT_LIMIT : Math.min(limit, 20);
        if (tenantId == null || styleId == null) {
            return List.of();
        }
        StyleInfo current = styleInfoService.getById(styleId);
        if (current == null) {
            return List.of();
        }

        // 候选池：同店所有已上架款式（数量级是百，不值得上分页）
        List<StyleInfo> pool = styleInfoService.list(new LambdaQueryWrapper<StyleInfo>()
                .eq(StyleInfo::getTenantId, tenantId)
                .eq(StyleInfo::getShopListed, 1)
                .ne(StyleInfo::getId, styleId)
                .orderByDesc(StyleInfo::getShopListingTime));
        if (pool.isEmpty()) {
            return List.of();
        }

        // 个人偏好画像：品类/季节的加权计数 + 看过的款号前缀（如 BR26X1 是一条产品线）
        Preference pref = buildPreference(tenantId, consumerId);
        Map<String, Integer> heat = hottestMap(tenantId);

        final String curCategory = norm(current.getCategory());
        final String curSeason = norm(current.getSeason());
        final String curPrefix = prefixOf(current.getStyleNo());

        List<Scored> scored = new ArrayList<>();
        for (StyleInfo s : pool) {
            if (s.getId() == null) {
                continue;
            }
            double score = 0;
            String reason = null;

            // ① 相关性：同品类 + 同季节是「相关」的基础
            boolean sameCategory = StringUtils.hasText(curCategory) && curCategory.equals(norm(s.getCategory()));
            boolean sameSeason = StringUtils.hasText(curSeason) && curSeason.equals(norm(s.getSeason()));
            if (sameCategory && sameSeason) {
                score += 60;
                reason = "同类同季";
            } else if (sameCategory) {
                score += 40;
                reason = "同类";
            } else if (sameSeason) {
                score += 22;
                reason = "同季";
            }

            // ② 个人偏好：像他历史里爱看的
            double personal = pref.scoreOf(s);
            if (personal > 0) {
                score += personal;
                reason = reason == null ? "你常看" : reason + " · 你常看";
            }

            // ③ 热度兜底权重：保证候选不足时能靠热度补齐
            score += Math.min(10, heat.getOrDefault(String.valueOf(s.getId()), 0) * 0.5);

            // 完全不相关且没有任何个人依据的，排到最后
            if (score <= 0) {
                score = 1;
                reason = "店内推荐";
            }
            scored.add(new Scored(s, score, reason));
        }

        scored.sort(Comparator.comparingDouble(Scored::score).reversed()
                .thenComparing(x -> String.valueOf(x.style.getStyleNo())));

        List<Scored> picked = scored.stream().limit(size).collect(Collectors.toList());
        return stockFirst(decorate(tenantId, picked, pref.isEmpty()));
    }

    /**
     * 有货的排前面（稳定排序，组内保持原有推荐顺序）。
     *
     * <p>实测发现「猜你喜欢」里会混进库存为 0 的款 —— 顾客点进去买不了，
     * 白白占掉一个推荐位。无货的不删（它仍然是本店真实商品，也许马上补货），
     * 但只让它在后面凑数。
     */
    static List<Map<String, Object>> stockFirst(List<Map<String, Object>> rows) {
        if (rows == null || rows.size() < 2) {
            return rows == null ? List.of() : rows;
        }
        List<Map<String, Object>> inStock = new ArrayList<>();
        List<Map<String, Object>> outOfStock = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Object stock = r.get("totalStock");
            int n = stock instanceof Number num ? num.intValue() : 0;
            (n > 0 ? inStock : outOfStock).add(r);
        }
        inStock.addAll(outOfStock);
        return inStock;
    }

    /** 补齐价格/库存/封面，并标注推荐理由 */
    private List<Map<String, Object>> decorate(Long tenantId, List<Scored> picked, boolean anonymous) {
        if (picked.isEmpty()) {
            return List.of();
        }
        List<Long> ids = picked.stream().map(x -> x.style.getId()).collect(Collectors.toList());
        List<ProductSku> skus = productSkuService.list(new LambdaQueryWrapper<ProductSku>()
                .eq(ProductSku::getTenantId, tenantId)
                .in(ProductSku::getStyleId, ids));
        Map<Long, List<ProductSku>> byStyle = skus.stream()
                .filter(k -> k.getStyleId() != null)
                .collect(Collectors.groupingBy(ProductSku::getStyleId));

        List<Map<String, Object>> out = new ArrayList<>();
        for (Scored x : picked) {
            List<ProductSku> list = byStyle.getOrDefault(x.style.getId(), List.of());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("styleId", x.style.getId());
            row.put("styleNo", x.style.getStyleNo());
            row.put("styleName", x.style.getStyleName());
            row.put("cover", x.style.getCover());
            row.put("minPrice", list.stream()
                    .map(ProductSku::getSalesPrice)
                    .filter(Objects::nonNull)
                    .reduce(java.math.BigDecimal::min)
                    .orElse(null));
            row.put("totalStock", list.stream()
                    .mapToInt(k -> k.getStockQuantity() == null ? 0 : k.getStockQuantity())
                    .sum());
            row.put("colorCount", (int) list.stream()
                    .map(ProductSku::getColor).filter(StringUtils::hasText)
                    .collect(Collectors.toSet()).size());
            row.put("reason", x.reason);
            out.add(row);
        }
        return out;
    }

    /** 浏览历史 → 偏好画像 */
    private Preference buildPreference(Long tenantId, String consumerId) {
        Preference pref = new Preference();
        if (!StringUtils.hasText(consumerId)) {
            return pref;
        }
        List<Map<String, Object>> views;
        try {
            views = browseLogMapper.recentViews(tenantId, consumerId, HISTORY_LIMIT);
        } catch (Exception e) {
            return pref;
        }
        if (views == null || views.isEmpty()) {
            return pref;
        }
        LocalDateTime now = LocalDateTime.now();
        Set<Long> seenStyles = new HashSet<>();
        for (Map<String, Object> v : views) {
            Long sid = toLong(v.get("styleId"));
            if (sid != null && !seenStyles.add(sid)) {
                continue; // 同一款只算一次偏好，避免刷浏览把某款顶上
            }
            double decay = decayOf(v.get("lastTime"), now);
            if (decay <= 0) {
                continue;
            }
            StyleInfo s = styleInfoService.getById(sid);
            if (s == null) {
                continue;
            }
            pref.add(norm(s.getCategory()), decay * 1.0);
            pref.add(norm(s.getSeason()), decay * 0.6);
            String p = prefixOf(s.getStyleNo());
            if (StringUtils.hasText(p)) {
                pref.addPrefix(p, decay * 1.4);
            }
        }
        return pref;
    }

    /** 时间衰减：越久远权重越低，90 天外直接归零 */
    static double decayOf(Object lastTime, LocalDateTime now) {
        LocalDateTime t = toTime(lastTime);
        if (t == null) {
            return 0;
        }
        long days = Duration.between(t, now).toDays();
        if (days < 0) {
            days = 0;
        }
        if (days > HISTORY_WINDOW.toDays()) {
            return 0;
        }
        return Math.pow(0.5, days / (double) HALF_LIFE_DAYS);
    }

    private Map<String, Integer> hottestMap(Long tenantId) {
        Map<String, Integer> out = new HashMap<>();
        try {
            for (Map<String, Object> row : browseLogMapper.hottestStyles(tenantId, 50)) {
                Long sid = toLong(row.get("styleId"));
                Long cnt = toLong(row.get("totalViews"));
                if (sid != null && cnt != null) {
                    out.put(String.valueOf(sid), cnt.intValue());
                }
            }
        } catch (Exception e) {
            // 热度拿不到不影响推荐主逻辑
            return Map.of();
        }
        return out;
    }

    // ── 小工具 ──

    private static String norm(String s) {
        return StringUtils.hasText(s) ? s.trim().toUpperCase(Locale.ROOT) : "";
    }

    /** 款号前缀（BR26X1W1150A → BR26X1），用于识别产品线 */
    private static String prefixOf(String styleNo) {
        if (!StringUtils.hasText(styleNo)) {
            return "";
        }
        String s = styleNo.trim().toUpperCase(Locale.ROOT);
        return s.length() <= 6 ? s : s.substring(0, 6);
    }

    private static Long toLong(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(v));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static LocalDateTime toTime(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof LocalDateTime t) {
            return t;
        }
        try {
            return LocalDateTime.parse(String.valueOf(v).replace(' ', 'T'));
        } catch (Exception e) {
            return null;
        }
    }

    private record Scored(StyleInfo style, double score, String reason) {
    }

    /**
     * 偏好画像：品类/季节/产品线前缀 → 加权计数。
     */
    static final class Preference {
        private final Map<String, Double> weights = new HashMap<>();

        void add(String key, double w) {
            if (!StringUtils.hasText(key)) {
                return;
            }
            weights.merge(key, w, Double::sum);
        }

        void addPrefix(String key, double w) {
            add("P:" + key, w);
        }

        boolean isEmpty() {
            return weights.isEmpty();
        }

        double scoreOf(StyleInfo s) {
            double total = 0;
            String cat = norm(s.getCategory());
            String season = norm(s.getSeason());
            String prefix = prefixOf(s.getStyleNo());
            if (StringUtils.hasText(cat)) {
                total += weights.getOrDefault(cat, 0d);
            }
            if (StringUtils.hasText(season)) {
                total += weights.getOrDefault(season, 0d) * 0.6;
            }
            if (StringUtils.hasText(prefix)) {
                total += weights.getOrDefault("P:" + prefix, 0d) * 1.4;
            }
            return total;
        }
    }
}