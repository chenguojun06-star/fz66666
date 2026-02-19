package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 出货对账实体类
 */
@Data
@TableName("t_shipment_reconciliation")
public class ShipmentReconciliation implements com.fashion.supplychain.finance.service.impl.BaseReconciliationServiceImpl.ReconciliationEntity {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /**
     * 对账单号
     */
    private String reconciliationNo;

    /**
     * 客户ID
     */
    private String customerId;

    /**
     * 客户名称
     */
    private String customerName;

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
     * 订单ID
     */
    private String orderId;

    /**
     * 订单号
     */
    private String orderNo;

    /**
     * 数量
     */
    private Integer quantity;

    @TableField(exist = false)
    private Integer productionCompletedQuantity;

    /**
     * 单价
     */
    private BigDecimal unitPrice;

    /**
     * 总金额
     */
    private BigDecimal totalAmount;

    /**
     * 扣款项金额
     */
    private BigDecimal deductionAmount;

    /**
     * 最终金额
     */
    private BigDecimal finalAmount;

    /**
     * 工序成本（从Phase 5 ScanRecord.scanCost汇总）
     */
    private BigDecimal scanCost;

    /**
     * 物料成本（可选，从物料对账获取）
     */
    private BigDecimal materialCost;

    /**
     * 总成本 = 工序成本 + 物料成本
     */
    private BigDecimal totalCost;

    /**
     * 利润 = finalAmount - totalCost
     */
    private BigDecimal profitAmount;

    /**
     * 利润率(%) = profitAmount / finalAmount * 100
     */
    private BigDecimal profitMargin;

    /**
     * 是否本厂(0:加工厂, 1:本厂)
     * 本厂订单：汇总扫码工资成本
     * 加工厂订单：按单价计算加工费
     */
    @TableField("is_own_factory")
    private Integer isOwnFactory;

    /**
     * 对账日期
     */
    private LocalDateTime reconciliationDate;

    /**
     * 状态(pending:待审核, verified:已验证, approved:已批准, paid:已收款, rejected:已拒绝)
     */
    private String status;

    /**
     * 备注
     */
    private String remark;

    private LocalDateTime verifiedAt;

    private LocalDateTime approvedAt;

    private LocalDateTime paidAt;

    private LocalDateTime reReviewAt;

    private String reReviewReason;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    private String createBy;
    private String updateBy;

    // ==================== 操作人字段（自动填充）====================

    private String reconciliationOperatorId;

    private String reconciliationOperatorName;

    private LocalDateTime reconciliationTime;

    private String auditorId;

    private String auditorName;

    private LocalDateTime auditTime;

    public String getCreateBy() {
        return createBy;
    }

    public void setCreateBy(String createBy) {
        this.createBy = createBy;
    }

    public String getUpdateBy() {
        return updateBy;
    }

    public void setUpdateBy(String updateBy) {
        this.updateBy = updateBy;
    }

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
