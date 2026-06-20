package com.fashion.supplychain.production.dto;

import lombok.Data;

/**
 * 外发工厂统计数据 VO
 * 对齐 PC 端 ExternalFactory FactorySidebar 的 7-Tag 统计
 * 用于小程序外发工厂页面工厂汇总状态条
 */
@Data
public class ExternalFactoryStatsVO {

    /**
     * 工厂ID
     */
    private String factoryId;

    /**
     * 工厂名称
     */
    private String factoryName;

    /**
     * 订单数
     */
    private long orderCount;

    /**
     * 总件数
     */
    private long totalQuantity;

    /**
     * 进行中订单数（status=production）
     */
    private long inProgressCount;

    /**
     * 已完成订单数（status=completed）
     */
    private long completedCount;

    /**
     * 款号数（去重 styleNo）
     */
    private long styleCount;

    /**
     * 逾期订单数（交期 < 今天 且 status != completed）
     */
    private long overdueCount;

    /**
     * 临近交期预警数（交期在 0-7 天内 且 status != completed）
     */
    private long warningCount;
}
