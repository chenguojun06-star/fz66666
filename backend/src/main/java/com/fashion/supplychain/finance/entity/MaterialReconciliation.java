package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
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
    
    private String materialId;
    
    private String materialCode;
    
    private String materialName;
    
    private String purchaseId;
    
    private String purchaseNo;

    private String orderId;

    private String orderNo;

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
    
    private String status;
    
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
}
