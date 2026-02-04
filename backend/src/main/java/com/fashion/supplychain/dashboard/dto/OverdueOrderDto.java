package com.fashion.supplychain.dashboard.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 延期订单DTO
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OverdueOrderDto {
    /**
     * 订单ID
     */
    private String id;

    /**
     * 订单号
     */
    private String orderNo;

    /**
     * 款号
     */
    private String styleNo;

    /**
     * 订单数量
     */
    private Integer quantity;

    /**
     * 交货日期
     */
    private String deliveryDate;

    /**
     * 延期天数
     */
    private Integer overdueDays;

    /**
     * 工厂名称
     */
    private String factoryName;
}
