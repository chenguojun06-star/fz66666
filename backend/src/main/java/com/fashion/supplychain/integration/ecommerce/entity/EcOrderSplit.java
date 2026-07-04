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
    /** 拆单类型：PARTIAL_STOCK缺货/BY_WAREHOUSE按仓/BY_SKU按SKU/PRESALE预售/ADDRESS按地址（Phase 2） */
    private String splitType;
    private Integer status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
