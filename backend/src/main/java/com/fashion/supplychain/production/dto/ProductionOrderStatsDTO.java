package com.fashion.supplychain.production.dto;

import lombok.Data;

/**
 * 生产订单统计数据 DTO
 * 用于顶部统计卡片，返回全局统计（非分页数据）
 * 
 * @author Copilot
 * @since 2026-02-05
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
}
