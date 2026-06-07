package com.fashion.supplychain.dashboard.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 延期项DTO（样衣开发/大货生产通用）
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DelayedItemDto {
    /**
     * ID（订单ID或款号ID）
     */
    private String id;

    /**
     * 编号（订单号或款号）
     */
    private String no;

    /**
     * 名称（款名或订单描述）
     */
    private String name;

    /**
     * 当前环节
     */
    private String stage;

    /**
     * 延期天数
     */
    private Integer overdueDays;

    /**
     * 计划完成日期
     */
    private String plannedEndDate;

    /**
     * 工厂名称（大货生产）
     */
    private String factoryName;

    /**
     * 类型：sample=样衣开发, bulk=大货生产
     */
    private String type;

    /**
     * 进度百分比
     */
    private Integer progress;

    /**
     * 订单数量（大货生产）
     */
    private Integer quantity;
}
