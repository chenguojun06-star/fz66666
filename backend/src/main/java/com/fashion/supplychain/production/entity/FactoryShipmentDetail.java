package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 外发工厂发货颜色尺码明细。
 * 每条发货单对应多条明细，明细 quantity 之和 = 发货单 shipQuantity。
 *
 * <p>闭环追踪字段：
 * <ul>
 *   <li>quantity — 工厂发货数量</li>
 *   <li>receivedQuantity — 本厂实际收货数量</li>
 *   <li>qualifiedQuantity — 质检合格数量（可入库）</li>
 *   <li>defectiveQuantity — 质检次品数量（需退回返修）</li>
 *   <li>returnedQuantity — 已退回返修数量</li>
 * </ul>
 * </p>
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

    /** 本次发货件数（工厂视角） */
    private Integer quantity;

    /** 本厂实际收货件数 */
    private Integer receivedQuantity;

    /** 质检合格件数 */
    private Integer qualifiedQuantity;

    /** 质检次品件数 */
    private Integer defectiveQuantity;

    /** 已退回返修件数 */
    private Integer returnedQuantity;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
