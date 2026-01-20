package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 物料采购实体类
 */
@Data
@TableName("t_material_purchase")
public class MaterialPurchase {
    
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    
    private String purchaseNo;

    private String materialId;
    
    private String materialCode;
    
    private String materialName;

    private String materialType;
    
    private String specifications;
    
    private String unit;
    
    private Integer purchaseQuantity;
    
    private Integer arrivedQuantity;
    
    private String supplierId;
    
    private String supplierName;
    
    private BigDecimal unitPrice;
    
    private BigDecimal totalAmount;

    private String receiverId;

    private String receiverName;

    private LocalDateTime receivedTime;

    private String remark;
    
    private String orderId;
    
    private String orderNo;

    private String styleId;

    private String styleNo;

    private String styleName;

    private String styleCover;

    private Integer returnConfirmed;

    private Integer returnQuantity;

    private String returnConfirmerId;

    private String returnConfirmerName;

    private LocalDateTime returnConfirmTime;
    
    private String status;
    
    private LocalDateTime createTime;
    
    private LocalDateTime updateTime;
    
    private Integer deleteFlag;

    // ==================== 到货日期字段（新增）====================
    
    /**
     * 预计到货日期
     */
    private LocalDateTime expectedArrivalDate;

    /**
     * 实际到货日期
     */
    private LocalDateTime actualArrivalDate;
}
