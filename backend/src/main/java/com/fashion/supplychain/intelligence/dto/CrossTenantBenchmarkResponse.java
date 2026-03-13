package com.fashion.supplychain.intelligence.dto;

import lombok.Data;
import java.math.BigDecimal;

/** 本企业经营指标快照响应（仅含本租户自身数据，不含任何跨租户信息） */
@Data
public class CrossTenantBenchmarkResponse {

    /** 本企业指标 */
    private TenantMetrics self;

    /** AI生成的经营分析建议（基于自身历史数据） */
    private String insight;

    /** 改善优先级提示 */
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
