package com.fashion.supplychain.logistics.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.fashion.supplychain.logistics.enums.ExpressCompanyEnum;
import com.fashion.supplychain.logistics.enums.LogisticsStatusEnum;
import com.fashion.supplychain.logistics.enums.ShipmentTypeEnum;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 快递单主表
 * 预留用于管理快递发货单
 */
@Data
@TableName("t_express_order")
public class ExpressOrder {

    @TableId(type = IdType.ASSIGN_ID)
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
     * 发货类型
     */
    private ShipmentTypeEnum shipmentType;

    /**
     * 物流状态
     */
    private LogisticsStatusEnum logisticsStatus;

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
     * 运费支付方式：1-寄付，2-到付
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
     * 收货人省份
     */
    private String receiverProvince;

    /**
     * 收货人城市
     */
    private String receiverCity;

    /**
     * 收货人区县
     */
    private String receiverDistrict;

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
     * 物流轨迹数据(JSON格式存储)
     */
    private String trackData;

    /**
     * 电商平台订单号（预留）
     */
    private String platformOrderNo;

    /**
     * 电商平台标识（预留：taobao/jd/pdd等）
     */
    private String platformCode;

    /**
     * 备注
     */
    private String remark;

    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    /**
     * 创建人ID
     */
    @TableField(fill = FieldFill.INSERT)
    private String creatorId;

    /**
     * 创建人姓名
     */
    @TableField(fill = FieldFill.INSERT)
    private String creatorName;

    /**
     * 更新人ID
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updaterId;

    /**
     * 更新人姓名
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updaterName;

    /**
     * 删除标志
     */
    @TableLogic
    @TableField(fill = FieldFill.INSERT)
    private Integer deleteFlag;
}
