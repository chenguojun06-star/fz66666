package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 外发工厂发货颜色尺码明细
 * 解决问题：t_factory_shipment 仅有整单 shipQuantity，无法追踪颜色+尺码粒度的发货数
 * 每条发货单（t_factory_shipment）对应多条明细，明细 quantity 之和 = 发货单 shipQuantity
 */
@Data
@TableName("t_factory_shipment_detail")
public class FactoryShipmentDetail {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 关联 t_factory_shipment.id */
    private String shipmentId;

    /** 颜色 */
    private String color;

    /** 尺码 */
    private String sizeName;

    /** 本次发货件数 */
    private Integer quantity;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
