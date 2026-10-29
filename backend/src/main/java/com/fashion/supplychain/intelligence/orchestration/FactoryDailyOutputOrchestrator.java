package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.FactoryDailyOutputResponse;
import com.fashion.supplychain.intelligence.dto.FactoryDailyOutputResponse.DailyPoint;
import com.fashion.supplychain.intelligence.helper.FactoryVelocityCalculator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * 工厂逐日产出编排器（2026-10-29）— 「工厂全动态详情」产能走势图。
 *
 * <p>解决的问题：原详情抽屉只有汇总数字（日均产能、在手件数），
 * 用户无法判断产能是"稳定 277/天"还是"14 天只干了 3 天"，
 * 也就无法判断该催单、转单还是换厂。走势图 + 峰谷标注 + 零产出日可视化
 * 才能让"产能稳定性"这个真实风险暴露出来。
 *
 * <p>口径（与 {@link FactoryVelocityCalculator#computeVelocitySample} 完全一致）：
 * 窗口 = 近 N 个<b>完整日</b>（截至昨天）；
 * 有产出日均 = 总件数 ÷ 有产出天数；日历日均 = 总件数 ÷ 窗口天数。
 * 两个都返回，前端显式标注，避免"两个日均差 2 倍"的误解
 * （277.3 是近 30 天口径、549.7 是近 14 天口径，都对，但必须写清窗口）。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class FactoryDailyOutputOrchestrator {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter LABEL_FMT = DateTimeFormatter.ofPattern("MM-dd");
    private static final int DEFAULT_DAYS = 14;
    private static final int MIN_DAYS = 7;
    private static final int MAX_DAYS = 60;

    private final FactoryVelocityCalculator factoryVelocityCalculator;

    /**
     * 构建工厂逐日产出响应。
     *
     * @param factoryName 工厂名（必填）
     * @param days        窗口天数，null/越界时收敛到 [7, 60]，默认 14
     */
    public FactoryDailyOutputResponse build(String factoryName, Integer days) {
        FactoryDailyOutputResponse resp = new FactoryDailyOutputResponse();
        String fn = factoryName == null ? "" : factoryName.trim();
        resp.setFactoryName(fn);

        int window = days == null ? DEFAULT_DAYS : days;
        window = Math.max(MIN_DAYS, Math.min(MAX_DAYS, window));
        resp.setDays(window);

        if (fn.isEmpty()) {
            return resp;
        }
        TenantAssert.assertTenantContext();

        FactoryVelocityCalculator.DailySeries series;
        try {
            series = factoryVelocityCalculator.computeDailySeries(fn, window);
        } catch (Exception e) {
            log.error("[工厂逐日产出] 计算失败 factory={}: {}", fn, e.getMessage());
            return resp;
        }

        List<LocalDate> dates = series.dates();
        int[] qty = series.quantities();
        if (dates == null || dates.isEmpty() || qty == null || qty.length != dates.size()) {
            return resp;
        }

        List<DailyPoint> points = new ArrayList<>(dates.size());
        int peakQty = -1;
        int lowQty = Integer.MAX_VALUE;
        String peakDate = null;
        String lowDate = null;
        for (int i = 0; i < dates.size(); i++) {
            LocalDate d = dates.get(i);
            int q = Math.max(0, qty[i]);
            DailyPoint p = new DailyPoint();
            p.setDate(d.format(DATE_FMT));
            p.setLabel(d.format(LABEL_FMT));
            p.setQty(q);
            p.setActive(q > 0);
            points.add(p);

            if (q > peakQty) {
                peakQty = q;
                peakDate = p.getDate();
            }
            if (q > 0 && q < lowQty) {
                lowQty = q;
                lowDate = p.getDate();
            }
        }
        resp.setPoints(points);
        resp.setWindowStart(dates.get(0).format(DATE_FMT));
        resp.setWindowEnd(dates.get(dates.size() - 1).format(DATE_FMT));

        long total = series.total();
        int activeDays = series.activeDays();
        resp.setTotalQty(total);
        resp.setActiveDays(activeDays);
        resp.setAvgPerActiveDay(activeDays > 0 ? round1((double) total / activeDays) : 0d);
        resp.setAvgPerCalendarDay(round1((double) total / window));

        resp.setPeakDate(peakQty > 0 ? peakDate : null);
        resp.setPeakQty(Math.max(0, peakQty));
        resp.setLowDate(lowQty == Integer.MAX_VALUE ? null : lowDate);
        resp.setLowQty(lowQty == Integer.MAX_VALUE ? 0 : lowQty);

        // 窗口末尾连续无产出天数（最近停摆信号）
        int streak = 0;
        for (int i = qty.length - 1; i >= 0; i--) {
            if (qty[i] > 0) break;
            streak++;
        }
        resp.setZeroStreak(streak);
        return resp;
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }
}
