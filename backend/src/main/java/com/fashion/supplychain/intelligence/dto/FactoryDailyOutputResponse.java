package com.fashion.supplychain.intelligence.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

/**
 * 工厂逐日产出（产能走势）响应 — 下单页「工厂全动态详情」趋势图的数据源。
 *
 * <p>为什么需要它：原来的工厂详情只有汇总数字（日均产能 X 件/天、在手 Y 件），
 * 看不出「产能稳不稳、最高哪天、最低哪天、最近是不是停摆了」。
 * 同样的日均 277 件/天，一种情况是每天稳定 277，另一种是 14 天里只干了 3 天
 * （每天 1200+），管理动作完全不同 —— 必须给出逐日序列。
 *
 * <p>口径说明（2026-10-29 统一，避免"两个日均打架"）：
 * <ul>
 *   <li>统计窗口：近 {@code days} 个<b>完整日</b>（截至昨天），与
 *       {@code FactoryVelocityCalculator.computeVelocitySample} 完全一致，
 *       因此 {@link #avgPerActiveDay} 与预下单预测里的 factoryDailyVelocity 同值</li>
 *   <li>{@link #avgPerActiveDay}：窗口内总扫码件数 ÷ 有产出天数（活跃日均）</li>
 *   <li>{@link #avgPerCalendarDay}：窗口内总扫码件数 ÷ 窗口天数（日历日均，含零产出日）</li>
 *   <li>两个都返回，前端显式标注口径，杜绝"549.7 和 277.3 差 2 倍"这类误解</li>
 * </ul>
 */
@Data
public class FactoryDailyOutputResponse {

    /** 工厂名 */
    private String factoryName;

    /** 窗口天数（实际生效值，已做上下限收敛） */
    private int days;

    /** 窗口起（含）yyyy-MM-dd */
    private String windowStart;

    /** 窗口止（含）yyyy-MM-dd，通常是昨天 */
    private String windowEnd;

    /** 逐日产出点（按日期升序，长度 = days） */
    private List<DailyPoint> points = new ArrayList<>();

    /** 窗口内总产出件数 */
    private long totalQty;

    /** 窗口内有产出的天数 */
    private int activeDays;

    /** 有产出日均（件/天）= totalQty ÷ activeDays；activeDays=0 时为 0 */
    private double avgPerActiveDay;

    /** 日历日均（件/天）= totalQty ÷ days（含零产出日） */
    private double avgPerCalendarDay;

    /** 峰值日期 yyyy-MM-dd（无数据时为空） */
    private String peakDate;

    /** 峰值产量 */
    private int peakQty;

    /** 有产出日中的最低日期 yyyy-MM-dd（无数据时为空） */
    private String lowDate;

    /** 有产出日中的最低产量 */
    private int lowQty;

    /** 窗口末尾连续无产出天数（最近停摆风险信号，0 表示昨天有产出） */
    private int zeroStreak;

    /** 单个日产出点 */
    @Data
    public static class DailyPoint {
        /** 完整日期 yyyy-MM-dd */
        private String date;
        /** 短标签 MM-dd */
        private String label;
        /** 当日产出件数 */
        private int qty;
        /** 当日是否有生产记录 */
        private boolean active;
    }
}
