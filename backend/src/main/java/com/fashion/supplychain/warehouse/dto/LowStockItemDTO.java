package com.fashion.supplychain.warehouse.dto;

import lombok.Data;

/**
 * 低库存预警项DTO
 */
@Data
public class LowStockItemDTO {
    /**
     * ID
     */
    private String id;

    /**
     * 物料编码
     */
    private String materialCode;

    /**
     * 物料名称
     */
    private String materialName;

    /**
     * 可用库存
     */
    private Integer availableQty;

    /**
     * 安全库存
     */
    private Integer safetyStock;

    /**
     * 单位
     */
    private String unit;

    /**
     * 缺口数量（安全库存 - 可用库存）
     */
    private Integer shortage;
}
