package com.fashion.supplychain.intelligence.dto;

import java.util.List;

/**
 * 工人效率画像响应 DTO
 */
public class WorkerProfileResponse {

    /** 工人姓名 */
    private String operatorName;

    /** 各工序效率列表（按总件数降序） */
    private List<StageProfile> stages;

    /** 统计期内总完成件数 */
    private long totalQty;

    /** 最近一次扫码时间（ISO格式） */
    private String lastScanTime;

    /** 统计天数范围 */
    private int dateDays;

    // ── inner class ───────────────────────────────────────────────────────

    public static class StageProfile {
        /** 工序名（如：车缝、裁剪） */
        private String stageName;

        /** 该工序日均完成件数 */
        private double avgPerDay;

        /** 期间总完成件数 */
        private long totalQty;

        /** 活跃天数（有扫码记录的天数） */
        private int activeDays;

        /**
         * 与工厂均值比较百分点（+20 = 高于均值20%，-15 = 低于均值15%）
         * 无法计算时为 0
         */
        private double vsFactoryAvgPct;

        /**
         * 综合水平：excellent / good / normal / below
         * excellent ≥ 工厂均值130%
         * good      ≥ 工厂均值90%
         * normal    ≥ 工厂均值70%
         * below     < 工厂均值70%
         */
        private String level;

        public String getStageName() { return stageName; }
        public void setStageName(String stageName) { this.stageName = stageName; }

        public double getAvgPerDay() { return avgPerDay; }
        public void setAvgPerDay(double avgPerDay) { this.avgPerDay = avgPerDay; }

        public long getTotalQty() { return totalQty; }
        public void setTotalQty(long totalQty) { this.totalQty = totalQty; }

        public int getActiveDays() { return activeDays; }
        public void setActiveDays(int activeDays) { this.activeDays = activeDays; }

        public double getVsFactoryAvgPct() { return vsFactoryAvgPct; }
        public void setVsFactoryAvgPct(double vsFactoryAvgPct) { this.vsFactoryAvgPct = vsFactoryAvgPct; }

        public String getLevel() { return level; }
        public void setLevel(String level) { this.level = level; }
    }

    // ── getters / setters ─────────────────────────────────────────────────

    public String getOperatorName() { return operatorName; }
    public void setOperatorName(String operatorName) { this.operatorName = operatorName; }

    public List<StageProfile> getStages() { return stages; }
    public void setStages(List<StageProfile> stages) { this.stages = stages; }

    public long getTotalQty() { return totalQty; }
    public void setTotalQty(long totalQty) { this.totalQty = totalQty; }

    public String getLastScanTime() { return lastScanTime; }
    public void setLastScanTime(String lastScanTime) { this.lastScanTime = lastScanTime; }

    public int getDateDays() { return dateDays; }
    public void setDateDays(int dateDays) { this.dateDays = dateDays; }
}
