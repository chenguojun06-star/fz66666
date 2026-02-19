package com.fashion.supplychain.warehouse.dto;

import lombok.Data;
import java.math.BigDecimal;

/**
 * 仓库统计数据DTO
 */
@Data
public class WarehouseStatsDTO {
    /**
     * 库存总值
     */
    private BigDecimal totalValue;

    /**
     * 物料种类数
     */
    private Integer materialCount;

    /**
     * 成品总数
     */
    private Integer finishedCount;

    /**
     * 低库存预警数量
     */
    private Integer lowStockCount;

    /**
     * 今日入库次数
     */
    private Integer todayInbound;

    /**
     * 今日出库次数
     */
    private Integer todayOutbound;
}
