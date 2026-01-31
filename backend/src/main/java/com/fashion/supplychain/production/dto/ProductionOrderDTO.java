package com.fashion.supplychain.production.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 生产订单DTO
 * 用于API返回，不包含敏感字段
 */
@Data
public class ProductionOrderDTO {

    /**
     * 订单ID
     */
    private String id;

    /**
     * 订单编号
     */
    private String orderNo;

    /**
     * 款式ID
     */
    private String styleId;

    /**
     * 款式编号
     */
    private String styleNo;

    /**
     * 款式名称
     */
    private String styleName;

    /**
     * 工厂名称
     */
    private String factoryName;

    /**
     * 订单数量
     */
    private Integer orderQuantity;

    /**
     * 已完成数量
     */
    private Integer completedQuantity;

    /**
     * 生产进度百分比
     */
    private Integer productionProgress;

    /**
     * 订单状态
     */
    private String status;

    /**
     * 当前工序名称
     */
    private String currentProcessName;

    /**
     * 计划开始时间
     */
    private LocalDateTime plannedStartTime;

    /**
     * 计划完成时间
     */
    private LocalDateTime plannedEndTime;

    /**
     * 实际开始时间
     */
    private LocalDateTime actualStartTime;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;

    /**
     * 入库数量（合格品）
     */
    private Integer warehousingQualifiedQuantity;

    /**
     * 出库数量
     */
    private Integer outstockQuantity;

    /**
     * 在库数量
     */
    private Integer inStockQuantity;

    /**
     * 次品数量
     */
    private Integer unqualifiedQuantity;

    /**
     * 返修数量
     */
    private Integer repairQuantity;

    /**
     * 裁剪数量
     */
    private Integer cuttingQuantity;

    /**
     * 菲号数量
     */
    private Integer cuttingBundleCount;

    // 注意：以下敏感字段不包含在DTO中
    // - factoryUnitPrice (工厂单价)
    // - quotationUnitPrice (报价单价)
    // - costPrice (成本价)
    // - profit (利润)
}
