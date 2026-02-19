package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.FieldFill;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 物料对账实体类
 */
@Data
@TableName("t_material_reconciliation")
public class MaterialReconciliation implements com.fashion.supplychain.finance.service.impl.BaseReconciliationServiceImpl.ReconciliationEntity {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String reconciliationNo;

    private String supplierId;

    private String supplierName;

    /**
     * 供应商联系人
     */
    private String supplierContactPerson;

    /**
     * 供应商联系电话
     */
    private String supplierContactPhone;

    private String materialId;

    private String materialCode;

    private String materialName;

    /**
     * 物料图片URL（不映射到数据库，由业务层填充）
     */
    @TableField(exist = false)
    private String materialImageUrl;

    /**
     * 采购员姓名（不映射到数据库，由业务层填充）
     */
    @TableField(exist = false)
    private String purchaserName;

    /**
     * 单位（不映射到数据库，由业务层填充）
     */
    @TableField(exist = false)
    private String unit;

    private String purchaseId;

    private String purchaseNo;

    /**
     * 采购类型: order=批量订单, sample=样衣开发
     */
    private String sourceType;

    private String orderId;

    private String orderNo;

    /**
     * 样衣生产ID（样衣采购时关联）
     */
    private String patternProductionId;

    private String styleId;

    private String styleNo;

    private String styleName;

    @TableField(exist = false)
    private Integer productionCompletedQuantity;

    private Integer quantity;

    private BigDecimal unitPrice;

    private BigDecimal totalAmount;

    private BigDecimal deductionAmount;

    private BigDecimal finalAmount;

    private String reconciliationDate;

    /**
     * 预计到货日期
     */
    private LocalDateTime expectedArrivalDate;

    /**
     * 实际到货日期
     */
    private LocalDateTime actualArrivalDate;

    /**
     * 入库日期
     */
    private LocalDateTime inboundDate;

    /**
     * 仓库库区
     */
    private String warehouseLocation;

    /**
     * 对账状态: pending=待审核, verified=已审核, approved=已批准, paid=已支付, rejected=已驳回
     */
    private String status;

    /**
     * 备注说明
     */
    private String remark;

    /**
     * 审核通过时间
     */
    private LocalDateTime verifiedAt;

    private LocalDateTime approvedAt;

    private LocalDateTime paidAt;

    private LocalDateTime reReviewAt;

    private String reReviewReason;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private String createBy;

    private String updateBy;

    private Integer deleteFlag;

    // ==================== 付款和对账周期字段（新增）====================

    /**
     * 已付金额
     */
    private BigDecimal paidAmount;

    /**
     * 对账周期开始日期
     */
    private LocalDateTime periodStartDate;

    /**
     * 对账周期结束日期
     */
    private LocalDateTime periodEndDate;

    /**
     * 对账人ID
     */
    private String reconciliationOperatorId;

    /**
     * 对账人姓名
     */
    private String reconciliationOperatorName;

    /**
     * 审核人ID
     */
    private String auditOperatorId;

    /**
     * 审核人姓名
     */
    private String auditOperatorName;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
