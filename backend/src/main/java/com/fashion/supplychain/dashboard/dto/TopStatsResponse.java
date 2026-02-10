package com.fashion.supplychain.dashboard.dto;

/**
 * 顶部4个核心统计看板的响应数据 - 包含日周月年4个时间维度
 */
public class TopStatsResponse {
    private TimeRangeStats sampleDevelopment;  // 样衣开发
    private TimeRangeStats bulkOrder;          // 大货下单
    private TimeRangeStats cutting;            // 裁剪
    private TimeRangeStats warehousing;        // 出入库

    public TimeRangeStats getSampleDevelopment() {
        return sampleDevelopment;
    }

    public void setSampleDevelopment(TimeRangeStats sampleDevelopment) {
        this.sampleDevelopment = sampleDevelopment;
    }

    public TimeRangeStats getBulkOrder() {
        return bulkOrder;
    }

    public void setBulkOrder(TimeRangeStats bulkOrder) {
        this.bulkOrder = bulkOrder;
    }

    public TimeRangeStats getCutting() {
        return cutting;
    }

    public void setCutting(TimeRangeStats cutting) {
        this.cutting = cutting;
    }

    public TimeRangeStats getWarehousing() {
        return warehousing;
    }

    public void setWarehousing(TimeRangeStats warehousing) {
        this.warehousing = warehousing;
    }

    /**
     * 单个指标的4个时间维度数据
     */
    public static class TimeRangeStats {
        private int day;    // 今日
        private int week;   // 本周
        private int month;  // 本月
        private int year;   // 本年
        private int total;  // 汇总（全部）

        public int getDay() {
            return day;
        }

        public void setDay(int day) {
            this.day = day;
        }

        public int getWeek() {
            return week;
        }

        public void setWeek(int week) {
            this.week = week;
        }

        public int getMonth() {
            return month;
        }

        public void setMonth(int month) {
            this.month = month;
        }

        public int getYear() {
            return year;
        }

        public void setYear(int year) {
            this.year = year;
        }

        public int getTotal() {
            return total;
        }

        public void setTotal(int total) {
            this.total = total;
        }
    }
}
