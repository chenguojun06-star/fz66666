package com.fashion.supplychain.integration.ecommerce.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_ec_order_split")
public class EcOrderSplit {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long originalOrderId;
    private String originalOrderNo;
    private String splitOrderNo;
    private String skuCode;
    private String warehouse;
    private Integer splitQuantity;
    private String splitReason;
    private Integer status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
