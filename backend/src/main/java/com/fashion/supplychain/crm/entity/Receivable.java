package com.fashion.supplychain.crm.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 应收账款实体
 */
@Data
@TableName("t_receivable")
public class Receivable {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 应收单号（AR + 时间戳，自动生成） */
    private String receivableNo;

    /** 关联客户 ID */
    private String customerId;

    /** 客户名称（冗余，查询用） */
    private String customerName;

    /** 关联生产订单 ID（可为空） */
    private String orderId;

    /** 订单号（冗余） */
    private String orderNo;

    /** 应收总金额 */
    private BigDecimal amount;

    /** 已收金额 */
    private BigDecimal receivedAmount;

    /** 约定到账日期 */
    private LocalDate dueDate;

    /**
     * 状态：
     * PENDING  - 待收款
     * PARTIAL  - 部分到账
     * PAID     - 已结清
     * OVERDUE  - 逾期
     */
    private String status;

    /** 备注 */
    private String description;

    private String sourceBizType;

    private String sourceBizId;

    private String sourceBizNo;

    private String billAggregationId;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    /** 软删除：0=正常 1=已删除 */
    private Integer deleteFlag;

    private String creatorId;
    private String creatorName;

    /** 租户 ID */
    private Long tenantId;
}
