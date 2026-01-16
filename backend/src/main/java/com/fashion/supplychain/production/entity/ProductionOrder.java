package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 生产订单实体类
 */
@Data
@TableName("t_production_order")
public class ProductionOrder {

    /**
     * 主键ID
     */
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /**
     * 订单号
     */
    private String orderNo;

    private String qrCode;

    private String color;

    private String size;

    @TableField("order_details")
    private String orderDetails;

    @TableField("progress_workflow_json")
    private String progressWorkflowJson;

    @TableField("progress_workflow_locked")
    private Integer progressWorkflowLocked;

    @TableField("progress_workflow_locked_at")
    private LocalDateTime progressWorkflowLockedAt;

    @TableField("progress_workflow_locked_by")
    private String progressWorkflowLockedBy;

    @TableField("progress_workflow_locked_by_name")
    private String progressWorkflowLockedByName;

    /**
     * 款号ID
     */
    private String styleId;

    /**
     * 款号
     */
    private String styleNo;

    /**
     * 款名
     */
    private String styleName;

    /**
     * 加工厂ID
     */
    private String factoryId;

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
     * 物料到位率(%)
     */
    private Integer materialArrivalRate;

    /**
     * 生产进度(%)
     */
    private Integer productionProgress;

    /**
     * 状态(pending:待生产, production:生产中, completed:已完成, delayed:已逾期)
     */
    private String status;

    /**
     * 计划开始日期
     */
    private LocalDateTime plannedStartDate;

    /**
     * 计划完成日期
     */
    private LocalDateTime plannedEndDate;

    /**
     * 实际开始日期
     */
    private LocalDateTime actualStartDate;

    /**
     * 实际完成日期
     */
    private LocalDateTime actualEndDate;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;

    /**
     * 删除标志(0:正常,1:删除)
     */
    private Integer deleteFlag;

    @TableField(exist = false)
    private String styleCover;

    @TableField(exist = false)
    private Integer cuttingQuantity;

    @TableField(exist = false)
    private Integer cuttingBundleCount;

    @TableField(exist = false)
    private String currentProcessName;

    @TableField(exist = false)
    private Integer warehousingQualifiedQuantity;

    @TableField(exist = false)
    private Integer outstockQuantity;

    @TableField(exist = false)
    private Integer inStockQuantity;

    @TableField(exist = false)
    private BigDecimal factoryUnitPrice;

    @TableField(exist = false)
    private LocalDateTime orderStartTime;

    @TableField(exist = false)
    private LocalDateTime orderEndTime;

    @TableField(exist = false)
    private String orderOperatorName;

    @TableField(exist = false)
    private Integer orderCompletionRate;

    @TableField(exist = false)
    private LocalDateTime procurementStartTime;

    @TableField(exist = false)
    private LocalDateTime procurementEndTime;

    @TableField(exist = false)
    private String procurementOperatorName;

    @TableField(exist = false)
    private Integer procurementCompletionRate;

    @TableField(exist = false)
    private LocalDateTime cuttingStartTime;

    @TableField(exist = false)
    private LocalDateTime cuttingEndTime;

    @TableField(exist = false)
    private String cuttingOperatorName;

    @TableField(exist = false)
    private Integer cuttingCompletionRate;

    @TableField(exist = false)
    private LocalDateTime sewingStartTime;

    @TableField(exist = false)
    private LocalDateTime sewingEndTime;

    @TableField(exist = false)
    private String sewingOperatorName;

    @TableField(exist = false)
    private Integer sewingCompletionRate;

    @TableField(exist = false)
    private LocalDateTime qualityStartTime;

    @TableField(exist = false)
    private LocalDateTime qualityEndTime;

    @TableField(exist = false)
    private String qualityOperatorName;

    @TableField(exist = false)
    private Integer qualityCompletionRate;

    @TableField(exist = false)
    private LocalDateTime warehousingStartTime;

    @TableField(exist = false)
    private LocalDateTime warehousingEndTime;

    @TableField(exist = false)
    private String warehousingOperatorName;

    @TableField(exist = false)
    private Integer warehousingCompletionRate;
}
