package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName("t_purchase_cart")
public class PurchaseCart {
    
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
    
    private String userId;
    
    private String status;
    
    private Integer totalItems;
    
    private BigDecimal totalAmount;
    
    private String remark;
    
    @TableField(fill = FieldFill.INSERT)
    private Integer deleteFlag;
    
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdTime;
    
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedTime;
    
    @TableField(exist = false)
    private List<PurchaseCartItem> items;
}
