package com.fashion.supplychain.integration.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_express_order")
public class ExpressOrder {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    private String trackingNo;
    private String trackingNoSub;
    private Integer expressCompany;
    private Integer shipmentType;
    private Integer logisticsStatus;
    private String orderId;
    private String orderNo;
    private String styleId;
    private String styleNo;
    private String styleName;
    private Integer shipmentQuantity;
    private BigDecimal weight;
    private BigDecimal freightAmount;
    private Integer freightPayType;
    private String shipperId;
    private String shipperName;
    private LocalDateTime shipTime;
    private String receiverName;
    private String receiverPhone;
    private String receiverAddress;
    private String receiverProvince;
    private String receiverCity;
    private String receiverDistrict;
    private LocalDateTime estimatedArrivalTime;
    private LocalDateTime actualSignTime;
    private String signPerson;
    private LocalDateTime trackUpdateTime;
    private String trackData;
    private String platformOrderNo;
    private String platformCode;
    private Integer deleteFlag;
    private Long tenantId;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
