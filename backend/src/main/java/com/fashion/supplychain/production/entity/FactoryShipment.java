package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_factory_shipment")
public class FactoryShipment {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String shipmentNo;
    private String orderId;
    private String orderNo;
    private String styleNo;
    private String styleName;
    private String factoryId;
    private String factoryName;
    private Integer shipQuantity;
    private Integer receivedQuantity;
    private LocalDateTime shipTime;
    private String shippedBy;
    private String shippedByName;
    private String trackingNo;
    private String expressCompany;
    private String shipMethod;
    private String receiveStatus;
    private LocalDateTime receiveTime;
    private String receivedBy;
    private String receivedByName;
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    @TableField(fill = FieldFill.INSERT)
    private String creatorId;

    @TableField(fill = FieldFill.INSERT)
    private String creatorName;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    @TableLogic
    private Integer deleteFlag;
}
