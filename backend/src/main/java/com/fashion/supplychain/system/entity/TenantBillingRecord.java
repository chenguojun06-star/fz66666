package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 租户计费记录
 */
@Data
@TableName("t_tenant_billing_record")
public class TenantBillingRecord {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 账单编号 BILL20260222001 */
    private String billingNo;

    /** 租户ID */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 租户名称(冗余) */
    private String tenantName;

    /** 账单月份 2026-02 */
    private String billingMonth;

    /** 套餐类型 */
    private String planType;

    /** 套餐基础费 */
    private BigDecimal baseFee;

    /** 超额存储费 */
    private BigDecimal storageFee;

    /** 超额用户费 */
    private BigDecimal userFee;

    /** 合计金额 */
    private BigDecimal totalAmount;

    /** 状态: PENDING/PAID/OVERDUE/WAIVED */
    private String status;

    /** 支付时间 */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime paidTime;

    /** 备注 */
    private String remark;

    /** 创建人 */
    private String createdBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    @TableLogic
    private Integer deleteFlag;
}
