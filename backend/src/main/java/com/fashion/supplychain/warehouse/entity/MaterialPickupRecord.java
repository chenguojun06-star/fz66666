package com.fashion.supplychain.warehouse.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 面辅料领取记录实体
 * 记录内部/外部领取、审核流程及财务核算状态
 */
@Data
@TableName("t_material_pickup_record")
public class MaterialPickupRecord {

    /** 主键 UUID */
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 租户 ID */
    private String tenantId;

    /** 领取单号（自动生成，格式：PK + yyyyMMdd + 序号） */
    private String pickupNo;

    /** 领取类型：INTERNAL=内部  EXTERNAL=外部 */
    private String pickupType;

    /** 关联生产订单号 */
    private String orderNo;

    /** 关联款号 */
    private String styleNo;

    /** 物料 ID */
    private String materialId;

    /** 物料编号 */
    private String materialCode;

    /** 物料名称 */
    private String materialName;

    /** 物料类型 */
    private String materialType;

    /** 颜色 */
    private String color;

    /** 规格 */
    private String specification;

    /** 领取数量 */
    private BigDecimal quantity;

    /** 单位 */
    private String unit;

    /** 单价 */
    private BigDecimal unitPrice;

    /** 金额小计 = 数量 × 单价 */
    private BigDecimal amount;

    /** 领取人 ID */
    private String pickerId;

    /** 领取人姓名 */
    private String pickerName;

    /** 领取时间 */
    private LocalDateTime pickupTime;

    /** 审核状态：PENDING / APPROVED / REJECTED */
    private String auditStatus;

    /** 审核人 ID */
    private String auditorId;

    /** 审核人姓名 */
    private String auditorName;

    /** 审核时间 */
    private LocalDateTime auditTime;

    /** 审核备注 */
    private String auditRemark;

    /** 财务状态：PENDING / SETTLED */
    private String financeStatus;

    /** 财务核算备注 */
    private String financeRemark;

    /** 领取备注 */
    private String remark;

    /** 创建时间 */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /** 更新时间 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    /** 删除标记：0=正常 1=已删除 */
    @TableLogic
    private Integer deleteFlag;
}
