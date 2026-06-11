package com.fashion.supplychain.integration.ecommerce.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_ec_warehouse_allocation")
public class EcWarehouseAllocation {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long orderId;
    private String orderNo;
    private String skuCode;
    private String warehouse;
    private Integer allocatedQuantity;
    private String allocationType;
    private Integer priority;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
