package com.fashion.supplychain.integration.ecommerce.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_ec_universal_stock")
public class EcUniversalStock {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long styleId;
    private Long skuId;
    private String skuCode;
    private String warehouse;
    private Integer totalWarehoused;
    private Integer totalOutstock;
    private Integer pendingOrders;
    private Integer availableStock;
    private Integer safeStock;
    private Integer bufferStock;
    private Integer onWayProduction;
    private LocalDateTime lastSyncTime;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
