package com.fashion.supplychain.integration.ecommerce.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
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

    /** 分配综合得分 0-100（库存40+时效30+成本20+退货率10，Phase 2 智能分仓） */
    private BigDecimal score;

    /** 分配原因（透明化决策依据，展示给用户） */
    private String reason;

    /** 预估到货时效（天） */
    private Integer estimatedDays;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
