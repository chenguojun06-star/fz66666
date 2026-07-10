package com.fashion.supplychain.crm.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 销售退货单实体（P0铁律4：多租户隔离）
 */
@Data
@TableName("t_sales_return")
public class SalesReturn {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID（P0铁律4：多租户隔离） */
    private Long tenantId;

    /** 退货单号（自动生成） */
    private String returnNo;

    /** 原订单ID */
    private Long originalOrderId;

    /** 原订单号 */
    private String originalOrderNo;

    /** 关联电商订单ID（t_ecommerce_order.id），为空表示非电商退货 */
    private Long ecommerceOrderId;

    /** 客户ID */
    private String customerId;

    /** 客户名称 */
    private String customerName;

    /** 退货类型：FULL=全部退货/PARTIAL=部分退货 */
    private String returnType;

    /** 退货原因 */
    private String returnReason;

    /** 退货状态：PENDING=待审核/APPROVED=已审核/REFUNDED=已退款/REJECTED=已拒绝 */
    private String returnStatus;

    /** 退货总金额 */
    private BigDecimal totalAmount;

    /** 实际退款金额 */
    private BigDecimal refundAmount;

    /** 操作人ID */
    private String operatorId;

    /** 操作人姓名 */
    private String operatorName;

    /** 审核时间 */
    private LocalDateTime approveTime;

    /** 审核人ID */
    private String approveUserId;

    /** 审核人姓名 */
    private String approveUserName;

    /** 退款时间 */
    private LocalDateTime refundTime;

    /** 备注 */
    private String remark;

    /** 创建时间 */
    private LocalDateTime createTime;

    /** 更新时间 */
    private LocalDateTime updateTime;

    /** 删除标记：0=正常 1=已删除 */
    private Integer deleteFlag;
}