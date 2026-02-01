package com.fashion.supplychain.logistics.dto;

import com.fashion.supplychain.logistics.enums.ExpressCompanyEnum;
import com.fashion.supplychain.logistics.enums.LogisticsStatusEnum;
import com.fashion.supplychain.logistics.enums.ShipmentTypeEnum;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 快递单DTO
 * 预留用于数据传输
 */
@Data
public class ExpressOrderDTO {

    private String id;

    /**
     * 快递单号
     */
    private String trackingNo;

    /**
     * 快递单号（备用）
     */
    private String trackingNoSub;

    /**
     * 快递公司
     */
    private ExpressCompanyEnum expressCompany;

    /**
     * 快递公司名称
     */
    private String expressCompanyName;

    /**
     * 发货类型
     */
    private ShipmentTypeEnum shipmentType;

    /**
     * 物流状态
     */
    private LogisticsStatusEnum logisticsStatus;

    /**
     * 物流状态描述
     */
    private String logisticsStatusDesc;

    /**
     * 关联订单ID
     */
    private String orderId;

    /**
     * 关联订单号
     */
    private String orderNo;

    /**
     * 款式ID
     */
    private String styleId;

    /**
     * 款式编号
     */
    private String styleNo;

    /**
     * 款式名称
     */
    private String styleName;

    /**
     * 发货数量
     */
    private Integer shipmentQuantity;

    /**
     * 发货重量(kg)
     */
    private BigDecimal weight;

    /**
     * 运费金额
     */
    private BigDecimal freightAmount;

    /**
     * 运费支付方式
     */
    private Integer freightPayType;

    /**
     * 发货人ID
     */
    private String shipperId;

    /**
     * 发货人姓名
     */
    private String shipperName;

    /**
     * 发货时间
     */
    private LocalDateTime shipTime;

    /**
     * 收货人姓名
     */
    private String receiverName;

    /**
     * 收货人电话
     */
    private String receiverPhone;

    /**
     * 收货人地址
     */
    private String receiverAddress;

    /**
     * 收货人完整地址（省市区+详细地址）
     */
    private String receiverFullAddress;

    /**
     * 预计到达时间
     */
    private LocalDateTime estimatedArrivalTime;

    /**
     * 实际签收时间
     */
    private LocalDateTime actualSignTime;

    /**
     * 签收人
     */
    private String signPerson;

    /**
     * 物流轨迹最后更新时间
     */
    private LocalDateTime trackUpdateTime;

    /**
     * 物流轨迹列表
     */
    private List<LogisticsTrackDTO> trackList;

    /**
     * 电商平台订单号
     */
    private String platformOrderNo;

    /**
     * 电商平台标识
     */
    private String platformCode;

    /**
     * 备注
     */
    private String remark;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 创建人姓名
     */
    private String creatorName;
}
