package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 订单结算审批付款实体类
 * 订单结算审核通过后，按工厂汇总生成付款记录
 */
@Data
@TableName("t_order_reconciliation_approval")
public class OrderReconciliationApproval {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /**
     * 工厂名称（本厂或加工厂名）
     */
    @TableField("factory_name")
    private String factoryName;

    /**
     * 是否本厂(0:加工厂, 1:本厂)
     */
    @TableField("is_own_factory")
    private Integer isOwnFactory;

    /**
     * 订单数量
     */
    @TableField("order_count")
    private Integer orderCount;

    /**
     * 总件数
     */
    @TableField("total_quantity")
    private Integer totalQuantity;

    /**
     * 总金额
     */
    @TableField("total_amount")
    private BigDecimal totalAmount;

    /**
     * 关联的结算单ID列表（逗号分隔）
     */
    @TableField("reconciliation_ids")
    private String reconciliationIds;

    /**
     * 状态(pending:待审核, verified:已验证, approved:已批准, paid:已付款, rejected:已拒绝)
     */
    private String status;

    /**
     * 批准时间
     */
    @TableField("approval_time")
    private LocalDateTime approvalTime;

    /**
     * 批准人
     */
    @TableField("approval_by")
    private String approvalBy;

    /**
     * 付款时间
     */
    @TableField("payment_time")
    private LocalDateTime paymentTime;

    /**
     * 付款人
     */
    @TableField("payment_by")
    private String paymentBy;

    /**
     * 付款方式（银行转账/现金/微信/支付宝）
     */
    @TableField("payment_method")
    private String paymentMethod;

    /**
     * 重审时间
     */
    @TableField("re_review_time")
    private LocalDateTime reReviewTime;

    /**
     * 重审原因
     */
    @TableField("re_review_reason")
    private String reReviewReason;

    /**
     * 备注
     */
    private String remark;

    /**
     * 创建时间
     */
    @TableField("create_time")
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    @TableField("update_time")
    private LocalDateTime updateTime;

    /**
     * 创建人
     */
    @TableField("create_by")
    private String createBy;

    /**
     * 更新人
     */
    @TableField("update_by")
    private String updateBy;
}
