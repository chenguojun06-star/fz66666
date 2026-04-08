package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_product_outstock")
public class ProductOutstock {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String outstockNo;

    private String orderId;

    private String orderNo;

    private String styleId;

    private String styleNo;

    private String styleName;

    private Integer outstockQuantity;

    private String outstockType;

    private String warehouse;

    private String remark;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;

    // ==================== 操作人字段（自动填充）====================

    @TableField(fill = FieldFill.INSERT)
    private String operatorId;

    @TableField(fill = FieldFill.INSERT)
    private String operatorName;

    @TableField(fill = FieldFill.INSERT)
    private String creatorId;

    @TableField(fill = FieldFill.INSERT)
    private String creatorName;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    // ==================== SKU明细与物流字段 ====================

    private String skuCode;

    private String color;

    private String size;

    private BigDecimal costPrice;

    private BigDecimal salesPrice;

    private String trackingNo;

    private String expressCompany;

    // ==================== 收货字段（历史遗留，不再在出库流程使用）====================

    private String receiveStatus;

    private LocalDateTime receiveTime;

    private String receivedBy;

    private String receivedByName;

    // ==================== 客户与收款字段 ====================

    private String customerName;

    private String customerPhone;

    private String shippingAddress;

    private BigDecimal totalAmount;

    private BigDecimal paidAmount;

    private String paymentStatus;

    private LocalDateTime settlementTime;

    // ==================== 审批字段 ====================

    private String approvalStatus;

    private String approveBy;

    private String approveByName;

    private LocalDateTime approveTime;
}
