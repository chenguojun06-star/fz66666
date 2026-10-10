package com.fashion.supplychain.shop.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.shop.mapper.ShopDashboardMapper;
import com.fashion.supplychain.shop.mapper.ShopStatDailyMapper;
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
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 店铺数据看板单测。
 *
 * <p>守住的几条：
 * <ol>
 *   <li><b>补零</b>：没有数据的日期也要出现（值为 0），否则趋势图会把「那天没人看」
 *       画成「那天不存在」；</li>
 *   <li>浏览/加购取自计数器，下单/金额取自订单表，两边按日期对齐；</li>
 *   <li>天数夹取（1~90），不让一次拉一年把库拖慢；</li>
 *   <li>无租户上下文返回空结构而不是报错。</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ShopDashboardOrchestratorTest {

    @Mock
    private ShopStatDailyMapper statDailyMapper;

    @Mock
    private ShopDashboardMapper dashboardMapper;

    @InjectMocks
    private ShopDashboardOrchestrator orchestrator;

    private static final long TENANT = 9L;
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    @BeforeEach
    void setUpContext() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(TENANT);
        UserContext.set(ctx);
    }

    @AfterEach
    void clearContext() {
        UserContext.clear();
    }

    private static Map<String, Object> statRow(String date, long browse, long cartAdd) {
        Map<String, Object> m = new HashMap<>();
        m.put("statDate", date);
        m.put("browseCount", browse);
        m.put("cartAddCount", cartAdd);
        return m;
    }

    private static Map<String, Object> orderRow(String date, long count, String amount) {
        Map<String, Object> m = new HashMap<>();
        m.put("statDate", date);
        m.put("orderCount", count);
        m.put("orderAmount", new BigDecimal(amount));
        return m;
    }

    @Test
    @DisplayName("① 日报按日期升序、缺失日期补零，四类数字按天对齐")
    void dailyFillsGapsAndAligns() {
        String today = LocalDate.now().format(FMT);
        String yesterday = LocalDate.now().minusDays(1).format(FMT);

        when(statDailyMapper.recentStats(TENANT, 3)).thenReturn(List.of(
                statRow(yesterday, 12, 3),
                statRow(today, 30, 5)));
        when(dashboardMapper.dailyOrders(TENANT, 3)).thenReturn(List.of(
                orderRow(today, 2, "599.00")));

        Map<String, Object> resp = orchestrator.daily(3);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> records = (List<Map<String, Object>>) resp.get("records");
        assertEquals(3, records.size());
        // 升序：最早的一天在最前
        assertEquals(LocalDate.now().minusDays(2).format(FMT), records.get(0).get("date"));
        // 第一天没有任何数据 → 四个数都是 0，但**这一行必须在**
        assertEquals(0L, records.get(0).get("browseCount"));
        assertEquals(0L, records.get(0).get("cartAddCount"));
        assertEquals(0L, records.get(0).get("orderCount"));
        assertEquals(BigDecimal.ZERO, records.get(0).get("orderAmount"));
        // 昨天：只有浏览/加购
        assertEquals(12L, records.get(1).get("browseCount"));
        assertEquals(3L, records.get(1).get("cartAddCount"));
        // 今天：四类都有
        assertEquals(30L, records.get(2).get("browseCount"));
        assertEquals(5L, records.get(2).get("cartAddCount"));
        assertEquals(2L, records.get(2).get("orderCount"));
        assertEquals(new BigDecimal("599.00"), records.get(2).get("orderAmount"));
    }

    @Test
    @DisplayName("② 区间汇总：今日 / 近 7 天 / 近 30 天三段")
    void summaryHasThreeSpans() {
        when(statDailyMapper.recentStats(anyLong(), anyInt())).thenReturn(new ArrayList<>());
        when(dashboardMapper.summaryOrders(anyLong(), anyInt())).thenReturn(Map.of(
                "orderCount", 3L, "orderAmount", new BigDecimal("100.00")));

        Map<String, Object> resp = orchestrator.daily(30);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> summary = (List<Map<String, Object>>) resp.get("summary");
        assertEquals(3, summary.size());
        assertEquals("今日", summary.get(0).get("label"));
        assertEquals(1, summary.get(0).get("days"));
        assertEquals("近 7 天", summary.get(1).get("label"));
        assertEquals(7, summary.get(1).get("days"));
        assertEquals("近 30 天", summary.get(2).get("label"));
        assertEquals(30, summary.get(2).get("days"));
        assertEquals(3L, summary.get(0).get("orderCount"));
        assertEquals(new BigDecimal("100.00"), summary.get(0).get("orderAmount"));
    }

    @Test
    @DisplayName("③ 天数夹取：0 → 1 天，999 → 90 天（不让一次拉一年）")
    void daysClamped() {
        when(statDailyMapper.recentStats(anyLong(), anyInt())).thenReturn(new ArrayList<>());
        when(dashboardMapper.dailyOrders(anyLong(), anyInt())).thenReturn(new ArrayList<>());
        when(dashboardMapper.summaryOrders(anyLong(), anyInt())).thenReturn(Map.of());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> one = (List<Map<String, Object>>) orchestrator.daily(0).get("records");
        assertEquals(1, one.size());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> max = (List<Map<String, Object>>) orchestrator.daily(999).get("records");
        assertEquals(90, max.size());
    }

    @Test
    @DisplayName("④ 无租户上下文：返回空结构，不查库、不报错")
    void noTenantReturnsEmpty() {
        UserContext.clear();

        Map<String, Object> resp = orchestrator.daily(7);

        assertTrue(((List<?>) resp.get("records")).isEmpty());
        assertTrue(((List<?>) resp.get("summary")).isEmpty());
        verify(statDailyMapper, never()).recentStats(anyLong(), anyInt());
        verify(dashboardMapper, never()).dailyOrders(anyLong(), anyInt());
    }

    @Test
    @DisplayName("⑤ 计数器里的日期带时分秒也能对齐（只取日期部分）")
    void dateStringToleratesTimePart() {
        String today = LocalDate.now().format(FMT);
        when(statDailyMapper.recentStats(TENANT, 1))
                .thenReturn(List.of(statRow(today + " 00:00:00", 7, 1)));
        when(dashboardMapper.dailyOrders(TENANT, 1)).thenReturn(new ArrayList<>());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> records =
                (List<Map<String, Object>>) orchestrator.daily(1).get("records");

        assertEquals(1, records.size());
        assertEquals(today, records.get(0).get("date"));
        assertEquals(7L, records.get(0).get("browseCount"));
        assertEquals(1L, records.get(0).get("cartAddCount"));
    }
}
