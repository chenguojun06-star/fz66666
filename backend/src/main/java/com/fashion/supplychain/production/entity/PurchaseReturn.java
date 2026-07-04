package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 采购退货单实体类
 * 对应表: t_purchase_return
 */
@Data
@TableName("t_purchase_return")
public class PurchaseReturn {

    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 租户ID（P0铁律4：多租户隔离）
     */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /**
     * 退货单号
     */
    private String returnNo;

    /**
     * 原采购单ID（MaterialPurchase.id）
     */
    private String originalPurchaseId;

    /**
     * 原采购单号（订单级采购时的orderNo，或单独采购时的purchaseNo）
     */
    private String originalPurchaseNo;

    /**
     * 供应商ID
     */
    private String supplierId;

    /**
     * 供应商名称
     */
    private String supplierName;

    /**
     * 退货类型：FULL=全部退货/PARTIAL=部分退货
     */
    private String returnType;

    /**
     * 退货原因
     */
    private String returnReason;

    /**
     * 退货状态：PENDING=待审核/APPROVED=已审核/RETURNED=已退货/REJECTED=已拒绝
     */
    private String returnStatus;

    /**
     * 退货总金额
     */
    private BigDecimal totalAmount;

    /**
     * 操作人ID
     */
    private String operatorId;

    /**
     * 操作人姓名
     */
    private String operatorName;

    /**
     * 审核时间
     */
    private LocalDateTime approveTime;

    /**
     * 审核人ID
     */
    private String approveUserId;

    /**
     * 审核人姓名
     */
    private String approveUserName;

    /**
     * 退货完成时间
     */
    private LocalDateTime returnTime;

    /**
     * 备注
     */
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    private Integer deleteFlag;
}