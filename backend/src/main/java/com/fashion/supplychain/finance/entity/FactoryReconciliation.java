package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import java.time.LocalDateTime;
import java.math.BigDecimal;
import lombok.Data;

/**
 * 加工厂对账实体类
 */
@Data
@TableName("t_factory_reconciliation")
public class FactoryReconciliation {
    
    /**
     * 主键ID
     */
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    
    /**
     * 对账单号
     */
    private String reconciliationNo;
    
    /**
     * 加工厂ID
     */
    private String factoryId;
    
    /**
     * 加工厂名称
     */
    private String factoryName;
    
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
     * 对账日期
     */
    private LocalDateTime reconciliationDate;
    
    /**
     * 状态(pending:待审核, verified:已验证, approved:已批准, paid:已付款, rejected:已拒绝)
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
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
    
    /**
     * 创建人
     */
    private String createBy;
    
    /**
     * 更新人
     */
    private String updateBy;
}
