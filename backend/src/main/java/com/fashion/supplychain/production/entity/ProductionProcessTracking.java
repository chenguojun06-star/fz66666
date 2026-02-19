package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 生产工序跟踪记录
 * 用途：裁剪完成后自动生成（菲号×工序），作为工资结算依据
 */
@Data
@TableName("t_production_process_tracking")
public class ProductionProcessTracking {

    /**
     * 主键ID（使用UUID策略，与其他实体保持一致）
     */
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /**
     * 生产订单ID（String类型UUID）
     */
    private String productionOrderId;

    /**
     * 订单号
     */
    private String productionOrderNo;

    /**
     * 菲号ID（裁剪单ID，String类型UUID）
     */
    private String cuttingBundleId;

    /**
     * 菲号编号（如：1, 2, 3...）
     */
    private Integer bundleNo;

    /**
     * SKU号
     */
    private String sku;

    /**
     * 颜色
     */
    private String color;

    /**
     * 尺码
     */
    private String size;

    /**
     * 数量
     */
    private Integer quantity;

    /**
     * 工序编号（如：sewing_001）
     */
    private String processCode;

    /**
     * 工序名称（如：车缝）
     */
    private String processName;

    /**
     * 工序顺序（1,2,3...）
     */
    private Integer processOrder;

    /**
     * 单价（元/件，用于工资结算）
     */
    private BigDecimal unitPrice;

    /**
     * 扫码状态：pending=待扫码, scanned=已扫码, reset=已重置
     */
    private String scanStatus;

    /**
     * 扫码时间
     */
    private LocalDateTime scanTime;

    /**
     * 关联的扫码记录ID（t_scan_record，String类型UUID）
     */
    private String scanRecordId;

    /**
     * 操作人ID（String类型UUID）
     */
    private String operatorId;

    /**
     * 操作人姓名
     */
    private String operatorName;

    /**
     * 结算金额（quantity × unit_price）
     */
    private BigDecimal settlementAmount;

    /**
     * 是否已结算（0=未结算，1=已结算）
     */
    private Boolean isSettled;

    /**
     * 结算时间
     */
    private LocalDateTime settledAt;

    /**
     * 结算批次号
     */
    private String settledBatchNo;

    /**
     * 结算人ID
     */
    private String settledBy;

    /**
     * 创建时间
     */
    private LocalDateTime createdAt;

    /**
     * 更新时间
     */
    private LocalDateTime updatedAt;

    /**
     * 创建人
     */
    private String creator;

    /**
     * 更新人
     */
    private String updater;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
