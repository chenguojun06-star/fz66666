package com.fashion.supplychain.shop.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.shop.mapper.ShopDashboardMapper;
import com.fashion.supplychain.shop.mapper.ShopStatDailyMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 店铺数据看板（日报）。
 *
 * <p><b>只做四个数：浏览 → 加购 → 下单 → 下单金额</b>。
 * 刻意不做「转化漏斗/归因/同比环比」这类需要埋点和口径定义的东西 ——
 * 一个档口老板要的是「今天有多少人看了、加了几件、成交多少」，
 * 复杂看板只会让人不看。
 *
 * <p><b>数据来源与为什么不统一</b>：
 * <ul>
 *   <li>浏览、加购：来自 {@code t_shop_stat_daily} 计数器 ——
 *       购物车行结算后会被删、浏览日志按「顾客+款式」合并，事后都还原不出按天的数；</li>
 *   <li>下单、下单金额：实时查 {@code t_shop_order}（逐单落行的事实表）——
 *       能从事实表算出来的数字就不再抄一份，避免两份数据打架。</li>
 * </ul>
 *
 * <p><b>补零</b>：没有数据的日期也要出现在结果里（值为 0），否则前端折线图会把
 * 「那天没人看」画成「那天不存在」，趋势会失真。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ShopDashboardOrchestrator {

    /** 看板最多回看天数（防止一次拉一年把库拖慢） */
    private static final int MAX_DAYS = 90;
    private static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final ShopStatDailyMapper statDailyMapper;
    private final ShopDashboardMapper dashboardMapper;

    /**
     * 日报：最近 N 天，按日期升序，缺失日期补 0。
     *
     * <p>租户取当前登录上下文（商家看自己的店铺）。
     */
    public Map<String, Object> daily(int days) {
        Long tenantId = UserContext.tenantId();
        int d = Math.min(Math.max(1, days), MAX_DAYS);

        Map<String, Object> resp = new LinkedHashMap<>();
        if (tenantId == null) {
            resp.put("records", List.of());
            resp.put("summary", List.of());
            return resp;
        }

        // ① 浏览 / 加购（计数器）
        Map<String, long[]> byDate = new LinkedHashMap<>();
        for (Map<String, Object> row : statDailyMapper.recentStats(tenantId, d)) {
            String date = toDateStr(row.get("statDate"));
            if (date == null) {
                continue;
            }
            long[] v = byDate.computeIfAbsent(date, k -> new long[2]);
            v[0] = toLong(row.get("browseCount"));
            v[1] = toLong(row.get("cartAddCount"));
        }

        // ② 下单 / 下单金额（事实表）
        Map<String, long[]> orderByDate = new LinkedHashMap<>();
        Map<String, BigDecimal> amountByDate = new LinkedHashMap<>();
        for (Map<String, Object> row : dashboardMapper.dailyOrders(tenantId, d)) {
            String date = toDateStr(row.get("statDate"));
            if (date == null) {
                continue;
            }
            orderByDate.put(date, new long[]{toLong(row.get("orderCount"))});
            amountByDate.put(date, toAmount(row.get("orderAmount")));
        }

        // ③ 按日期补零（从今天往回 d 天，含今天）
        LocalDate today = LocalDate.now();
        List<Map<String, Object>> records = new ArrayList<>();
        for (int i = d - 1; i >= 0; i--) {
            LocalDate day = today.minusDays(i);
            String key = day.format(DAY_FMT);
            long[] counts = byDate.getOrDefault(key, new long[2]);
            long[] orders = orderByDate.getOrDefault(key, new long[1]);

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("date", key);
            row.put("browseCount", counts[0]);
            row.put("cartAddCount", counts[1]);
            row.put("orderCount", orders[0]);
            row.put("orderAmount", amountByDate.getOrDefault(key, BigDecimal.ZERO));
            records.add(row);
        }

        resp.put("records", records);
        resp.put("summary", List.of(
                buildSummary(tenantId, "今日", 0),
                buildSummary(tenantId, "近 7 天", 6),
                buildSummary(tenantId, "近 30 天", 29)));
        return resp;
    }

    /**
     * 区间汇总。
     *
     * @param sinceDaysAgo 起始日（0=今天，6=近 7 天）
     */
    private Map<String, Object> buildSummary(Long tenantId, String label, int sinceDaysAgo) {
        int span = sinceDaysAgo + 1;
        long browse = 0;
        long cartAdd = 0;
        for (Map<String, Object> row : statDailyMapper.recentStats(tenantId, sinceDaysAgo)) {
            String date = toDateStr(row.get("statDate"));
            if (date == null) {
                continue;
            }
            LocalDate day = LocalDate.parse(date);
            if (day.isBefore(LocalDate.now().minusDays(sinceDaysAgo))) {
                continue;
            }
            browse += toLong(row.get("browseCount"));
            cartAdd += toLong(row.get("cartAddCount"));
        }
        Map<String, Object> orders = dashboardMapper.summaryOrders(tenantId, sinceDaysAgo);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("label", label);
        out.put("days", span);
        out.put("browseCount", browse);
        out.put("cartAddCount", cartAdd);
        out.put("orderCount", orders == null ? 0L : toLong(orders.get("orderCount")));
        out.put("orderAmount", orders == null ? BigDecimal.ZERO : toAmount(orders.get("orderAmount")));
        return out;
    }

    private static String toDateStr(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        if (s.length() >= 10) {
            return s.substring(0, 10);
        }
        return s.isEmpty() ? null : s;
    }

    private static long toLong(Object v) {
        if (v == null) {
            return 0L;
        }
        if (v instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    private static BigDecimal toAmount(Object v) {
        if (v == null) {
            return BigDecimal.ZERO;
        }
        try {
            return new BigDecimal(String.valueOf(v)).setScale(2, java.math.RoundingMode.HALF_UP);
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }
}
