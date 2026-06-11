package com.fashion.supplychain.integration.ecommerce.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_ec_purchase_suggestion")
public class EcPurchaseSuggestion {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long styleId;
    private Long skuId;
    private String skuCode;
    private String styleNo;
    private Integer suggestQuantity;
    private String urgencyLevel;
    private String reason;
    private Integer sales30d;
    private Integer availableStock;
    private Integer onWayStock;
    private Integer onWayProduction;
    private Integer targetDays;
    private Integer status;
    private Long purchaseOrderId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
