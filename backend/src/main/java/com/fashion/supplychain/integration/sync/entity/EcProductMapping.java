package com.fashion.supplychain.integration.sync.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_ec_product_mapping")
public class EcProductMapping {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    private Long styleId;
    private Long skuId;
    private String platformCode;
    private String platformItemId;
    private String platformSkuId;
    private String platformProductUrl;
    private String syncStatus;
    private LocalDateTime lastSyncedAt;
    private Integer syncVersion;
    private String errorMessage;
    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
