package com.fashion.supplychain.intelligence.dto;

import java.util.List;
import lombok.Data;

/**
 * 供应链健康指数响应 — 弧形仪表盘 + 五维雷达
 */
@Data
public class HealthIndexResponse {
    /** 综合健康指数 0-100 */
    private int healthIndex;
    /** 等级 excellent / good / warning / critical */
    private String grade;
    /** 5个维度得分 */
    private int productionScore;  // 生产执行
    private int deliveryScore;    // 交期履约
    private int qualityScore;     // 质量合格
    private int inventoryScore;   // 库存健康
    private int financeScore;     // 财务结算
    /** 近7天趋势数据 */
    private List<DailyIndex> trend;
    /** 最大风险描述 */
    private String topRisk;
    /** 改善建议 */
    private String suggestion;

    @Data
    public static class DailyIndex {
        private String date;
        private int index;
    }
}
