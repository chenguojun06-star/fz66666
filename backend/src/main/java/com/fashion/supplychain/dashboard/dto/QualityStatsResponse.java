package com.fashion.supplychain.dashboard.dto;

import lombok.Data;

/**
 * 质检统计响应数据
 */
@Data
public class QualityStatsResponse {
    /**
     * 入库总数
     */
    private Long totalWarehousing;

    /**
     * 次品总数
     */
    private Long defectiveCount;

    /**
     * 次品率（百分比）
     */
    private Double defectRate;

    /**
     * 合格率（百分比）
     */
    private Double qualifiedRate;

    /**
     * 返修问题数量
     */
    private Long repairIssues;
}
