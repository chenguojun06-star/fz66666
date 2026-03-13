package com.fashion.supplychain.intelligence.dto;

import lombok.Data;
import java.math.BigDecimal;
import java.util.List;

/** Stage5 预测引擎响应 */
@Data
public class ForecastEngineResponse {

    private String forecastType;
    private String subjectId;
    private String horizonLabel;

    /** 预测主值（金额/件数/用量） */
    private BigDecimal predictedValue;

    /** 乐观区间下界 */
    private BigDecimal optimisticLow;

    /** 悲观区间上界 */
    private BigDecimal pessimisticHigh;

    /** 置信度 0-100 */
    private Integer confidence;

    /** 算法标识 */
    private String algorithm;

    /** AI生成的文字摘要（含关键假设） */
    private String rationale;

    /** 维度明细（如成本拆分：物料+工序+损耗） */
    private List<BreakdownItem> breakdown;

    /** 历史偏差参考（近期预测 vs 实际的平均偏差%） */
    private String historicalBiasNote;

    @Data
    public static class BreakdownItem {
        private String label;
        private BigDecimal value;
        private String unit;
    }
}
