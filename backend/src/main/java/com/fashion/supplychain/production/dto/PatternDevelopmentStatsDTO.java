package com.fashion.supplychain.production.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * 样衣开发费用统计DTO
 */
@Data
public class PatternDevelopmentStatsDTO {

    /**
     * 时间范围类型：day=今日, week=本周, month=本月
     */
    private String rangeType;

    /**
     * 样衣数量
     */
    private Integer patternCount;

    /**
     * 面辅料费用
     */
    private BigDecimal materialCost;

    /**
     * 工序单价费用（样衣工序的总费用）
     */
    private BigDecimal processCost;

    /**
     * 二次工艺费用
     */
    private BigDecimal secondaryProcessCost;

    /**
     * 总开发费用
     */
    private BigDecimal totalCost;

    /**
     * 开发时间统计（秒数）
     */
    private Long totalDevelopmentTimeSeconds;

    /**
     * 每款成本明细列表（用于侧滑弹窗）
     */
    private List<StyleCostDetailDTO> styleCostDetails;

    public PatternDevelopmentStatsDTO() {
        this.patternCount = 0;
        this.materialCost = BigDecimal.ZERO;
        this.processCost = BigDecimal.ZERO;
        this.secondaryProcessCost = BigDecimal.ZERO;
        this.totalCost = BigDecimal.ZERO;
        this.totalDevelopmentTimeSeconds = 0L;
        this.styleCostDetails = new ArrayList<>();
    }
}
