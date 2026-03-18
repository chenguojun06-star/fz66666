package com.fashion.supplychain.production.dto;

import lombok.Data;

/**
 * 生产订单统计数据 DTO
 * 用于顶部统计卡片，返回全局统计（非分页数据）
 */
@Data
public class ProductionOrderStatsDTO {

    /**
     * 生产中订单数（非终态订单）
     */
    private long activeOrders;

    /**
     * 生产中数量（非终态订单的orderQuantity之和）
     */
    private long activeQuantity;

    /**
     * 已完成订单数
     */
    private long completedOrders;

    /**
     * 已完成数量（已完成订单的orderQuantity之和）
     */
    private long completedQuantity;

    /**
     * 已报废订单数
     */
    private long scrappedOrders;

    /**
     * 已报废数量（已报废订单的orderQuantity之和）
     */
    private long scrappedQuantity;

    /**
     * 总订单数
     * 兼容旧前端，等同于 activeOrders
     */
    private long totalOrders;

    /**
     * 总数量
     * 兼容旧前端，等同于 activeQuantity
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
