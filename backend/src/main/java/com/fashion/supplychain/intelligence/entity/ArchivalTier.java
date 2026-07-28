package com.fashion.supplychain.intelligence.entity;

/**
 * L5 Archival Memory 分级存储策略（P3-3）
 *
 * <p>基于归档数据的原始创建时间分级，优化 Qdrant 向量库召回效率：
 * <ul>
 *   <li>{@link #HOT} — 6 个月 ~ 1 年：访问频率高，召回优先级最高</li>
 *   <li>{@link #WARM} — 1 年 ~ 2 年：偶尔访问，HOT 未命中时扩展搜索</li>
 *   <li>{@link #COLD} — 2 年+：极少访问，仅明确历史查询时全量搜索</li>
 * </ul>
 *
 * <p>分级策略参考 five-layer-memory-design.md 第五章升级方案：
 * <ul>
 *   <li>归档时根据 original_create_time 自动计算 tier 写入 payload</li>
 *   <li>召回时默认只搜 HOT；HOT 不足时扩展到 HOT+WARM；明确历史查询时全量</li>
 *   <li>降低 Qdrant 向量库检索成本，提升热数据召回速度</li>
 * </ul>
 *
 * @author xiaoyun
 * @since 2026-07-28
 */
public enum ArchivalTier {

    /** 热归档：6 个月 ~ 1 年（访问频率高） */
    HOT("热归档"),

    /** 温归档：1 年 ~ 2 年（偶尔访问） */
    WARM("温归档"),

    /** 冷归档：2 年+（极少访问） */
    COLD("冷归档");

    private final String label;

    ArchivalTier(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    /**
     * 根据原始记录创建时间计算分级。
     *
     * @param originalCreateTime 原表记录的 create_time（非归档时间）
     * @param now                当前时间（传入避免每次调用 System）
     * @return 分级，null 表示 createTime 为空（按 HOT 处理更安全）
     */
    public static ArchivalTier of(java.time.LocalDateTime originalCreateTime,
                                  java.time.LocalDateTime now) {
        if (originalCreateTime == null || now == null) {
            return HOT;
        }
        java.time.LocalDateTime oneYearAgo = now.minusYears(1);
        java.time.LocalDateTime twoYearsAgo = now.minusYears(2);

        if (originalCreateTime.isAfter(oneYearAgo)) {
            return HOT;
        } else if (originalCreateTime.isAfter(twoYearsAgo)) {
            return WARM;
        } else {
            return COLD;
        }
    }
}
