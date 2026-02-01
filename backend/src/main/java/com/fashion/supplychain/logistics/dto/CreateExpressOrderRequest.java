package com.fashion.supplychain.logistics.dto;

import com.fashion.supplychain.logistics.enums.ExpressCompanyEnum;
import com.fashion.supplychain.logistics.enums.ShipmentTypeEnum;
import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import java.math.BigDecimal;

/**
 * 创建快递单请求DTO
 */
@Data
public class CreateExpressOrderRequest {

    /**
     * 快递单号
     */
    @NotBlank(message = "快递单号不能为空")
    private String trackingNo;

    /**
     * 快递公司
     */
    @NotNull(message = "快递公司不能为空")
    private ExpressCompanyEnum expressCompany;

    /**
     * 发货类型
     */
    private ShipmentTypeEnum shipmentType;

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
     * 收货人姓名
     */
    @NotBlank(message = "收货人姓名不能为空")
    private String receiverName;

    /**
     * 收货人电话
     */
    @NotBlank(message = "收货人电话不能为空")
    private String receiverPhone;

    /**
     * 收货人地址
     */
    @NotBlank(message = "收货人地址不能为空")
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
     * 电商平台订单号（预留）
     */
    private String platformOrderNo;

    /**
     * 电商平台标识（预留）
     */
    private String platformCode;

    /**
     * 备注
     */
    private String remark;
}
