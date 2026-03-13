package com.fashion.supplychain.intelligence.dto;

import lombok.Data;
import java.math.BigDecimal;

/** Stage8 跨租户基准对标响应 */
@Data
public class CrossTenantBenchmarkResponse {

    /** 本租户指标 */
    private TenantMetrics self;

    /** 行业基准（所有租户匿名聚合） */
    private TenantMetrics industryMedian;

    /** 行业最优值（P90） */
    private TenantMetrics industryTop10pct;

    /** 百分位排名（0-100，越高越好；100=行业最优） */
    private Integer percentileRank;

    /** 参与对标的租户数量 */
    private Integer peerCount;

    /** AI生成的对标分析与改进建议 */
    private String insight;

    /** 差距最大的指标名 */
    private String biggestGapMetric;

    /** 最值得对标学习的行为 */
    private String topLearning;

    @Data
    public static class TenantMetrics {
        /** 逾期率(%) */
        private BigDecimal overdueRate;

        /** 平均完成率(%) */
        private BigDecimal avgCompletionRate;

        /** 准时交货率(%) */
        private BigDecimal onTimeDeliveryRate;

        /** 次品率(%) */
        private BigDecimal defectRate;

        /** 综合效率分(0-100) */
        private BigDecimal efficiencyScore;
    }
}
