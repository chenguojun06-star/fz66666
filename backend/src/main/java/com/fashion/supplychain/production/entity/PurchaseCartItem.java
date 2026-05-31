package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("t_purchase_cart_item")
public class PurchaseCartItem {
    
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    
    private String cartId;
    
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
    
    private String materialCode;
    
    private String materialName;
    
    private String materialType;
    
    private String specifications;
    
    private String unit;
    
    private BigDecimal quantity;
    
    private String supplierId;
    
    private String supplierName;
    
    private BigDecimal unitPrice;
    
    private BigDecimal totalAmount;
    
    private String sourceType;
    
    private String sourceId;
    
    private String sourceNo;
    
    private BigDecimal sourceQuantity;
    
    private String color;
    
    private String fabricComposition;
    
    private String fabricWidth;
    
    private String fabricWeight;
    
    private String mergeGroupId;
    
    private String remark;
    
    private Integer sortOrder;
    
    @TableField(fill = FieldFill.INSERT)
    private Integer deleteFlag;
    
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdTime;
    
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedTime;
}
