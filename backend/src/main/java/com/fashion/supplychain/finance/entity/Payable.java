package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 应付账款实体
 */
@Data
@TableName("t_payable")
public class Payable {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 应付单号（AP + 时间戳，自动生成） */
    private String payableNo;

    /** 供应商ID */
    private String supplierId;
    /** 供应商名称（冗余） */
    private String supplierName;

    /** 关联采购单/对账单ID */
    private String orderId;
    /** 关联单号 */
    private String orderNo;

    /** 应付总金额 */
    private BigDecimal amount;
    /** 已付金额 */
    private BigDecimal paidAmount;

    /** 约定付款日期 */
    private LocalDate dueDate;

    /**
     * 状态：
     * PENDING  - 待付款
     * PARTIAL  - 部分付款
     * PAID     - 已结清
     * OVERDUE  - 逾期
     */
    private String status;

    private String description;
    private Integer deleteFlag;
    private String creatorId;
    private String creatorName;
    private Long tenantId;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
