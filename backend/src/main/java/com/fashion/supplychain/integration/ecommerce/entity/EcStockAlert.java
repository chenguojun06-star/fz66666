package com.fashion.supplychain.integration.ecommerce.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_ec_stock_alert")
public class EcStockAlert {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long styleId;
    private Long skuId;
    private String skuCode;
    private String warehouse;
    private String alertType;
    private Integer currentStock;
    private Integer safeStock;
    private String message;
    private Boolean isResolved;
    private LocalDateTime resolvedTime;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
