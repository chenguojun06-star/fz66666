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

        // ── 数据质量标记 ──────────────────────────────────────────────────
        /** 是否有真实历史完成订单数据（false=评分全为估算默认值） */
        private boolean hasRealData;
        /** 工厂日产能是否已配置（false=使用系统默认500件/日估算） */
        private boolean capacityConfigured;
        /** 数据说明文字（给前端展示用） */
        private String dataNote;
        /** 近30天实测日产能（件/天），0=无扫码数据 */
        private int realDailyCapacity;
        /** 产能数据来源：real=扫码实测 / configured=手动配置 / default=系统默认500 */
        private String capacitySource;
    }

    @Data
    public static class GanttItem {
        private String stage;
        private String startDate;
        private String endDate;
        private int days;
    }
}
