package com.fashion.supplychain.intelligence.dto;

import java.util.List;
import lombok.Data;

/**
 * 自动排产建议响应 — 最优工厂分配 + 甘特图数据
 */
@Data
public class SchedulingSuggestionResponse {
    /** 推荐方案列表（按优先级排列） */
    private List<SchedulePlan> plans;

    @Data
    public static class SchedulePlan {
        /** 推荐工厂 */
        private String factoryName;
        private Long factoryId;
        /** 推荐原因 */
        private String reason;
        /** 匹配度评分 0-100 */
        private int matchScore;
        /** 当前在产订单数 */
        private int currentLoad;
        /** 剩余产能（件/日） */
        private int availableCapacity;
        /** 建议开始日期 */
        private String suggestedStart;
        /** 预计完成日期 */
        private String estimatedEnd;
        /** 预计需要天数 */
        private int estimatedDays;
        /** 甘特图条目 */
        private List<GanttItem> ganttItems;
    }

    @Data
    public static class GanttItem {
        private String stage;
        private String startDate;
        private String endDate;
        private int days;
    }
}
