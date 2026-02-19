package com.fashion.supplychain.production.dto;

import lombok.Data;

/**
 * 生产订单统计数据 DTO
 * 用于顶部统计卡片，返回全局统计（非分页数据）
 */
@Data
public class ProductionOrderStatsDTO {

    /**
     * 总订单数（全部订单）
     */
    private long totalOrders;

    /**
     * 总数量（全部订单的orderQuantity之和）
     */
    private long totalQuantity;

    /**
     * 延期订单数
     */
    private long delayedOrders;

    /**
     * 延期订单数量（延期订单的orderQuantity之和）
     */
    private long delayedQuantity;

    /**
     * 当天下单数（创建时间在今天的订单数）
     */
    private long todayOrders;

    /**
     * 当天下单数量（当天订单的orderQuantity之和）
     */
    private long todayQuantity;
}
