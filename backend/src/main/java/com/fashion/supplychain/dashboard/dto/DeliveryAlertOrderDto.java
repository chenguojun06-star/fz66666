package com.fashion.supplychain.dashboard.dto;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 交期预警订单DTO
 * 用于展示即将到期的生产订单信息
 */
@Data
public class DeliveryAlertOrderDto {
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
     * 款名
     */
    private String styleName;

    /**
     * 加工厂名称
     */
    private String factoryName;

    /**
     * 订单数量
     */
    private Integer orderQuantity;

    /**
     * 完成数量
     */
    private Integer completedQuantity;

    /**
     * 生产进度(%)
     */
    private Integer productionProgress;

    /**
     * 计划完成日期
     */
    private LocalDateTime plannedEndDate;

    /**
     * 距离交期天数
     */
    private Integer daysUntilDelivery;
}
