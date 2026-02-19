package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 应用订单实体
 */
@Data
@TableName("t_app_order")
public class AppOrder {

    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 订单号：ORD20260210001
     */
    private String orderNo;

    /**
     * 租户ID
     */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /**
     * 租户名称
     */
    private String tenantName;

    /**
     * 应用ID
     */
    private Long appId;

    /**
     * 应用编码
     */
    private String appCode;

    /**
     * 应用名称
     */
    private String appName;

    /**
     * 订单类型：NEW/RENEW/UPGRADE
     */
    private String orderType;

    /**
     * 订阅类型：TRIAL/MONTHLY/YEARLY/PERPETUAL
     */
    private String subscriptionType;

    /**
     * 购买用户数
     */
    private Integer userCount;

    /**
     * 单价
     */
    private BigDecimal unitPrice;

    /**
     * 订单金额
     */
    private BigDecimal totalAmount;

    /**
     * 优惠金额
     */
    private BigDecimal discountAmount;

    /**
     * 实付金额
     */
    private BigDecimal actualAmount;

    /**
     * 状态：PENDING/PAID/CANCELED/REFUNDED
     */
    private String status;

    /**
     * 支付方式：WECHAT/ALIPAY/BANK/OFFLINE
     */
    private String paymentMethod;

    /**
     * 支付时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime paymentTime;

    /**
     * 联系人姓名
     */
    private String contactName;

    /**
     * 联系电话
     */
    private String contactPhone;

    /**
     * 联系邮箱
     */
    private String contactEmail;

    /**
     * 公司名称
     */
    private String companyName;

    /**
     * 是否需要发票
     */
    private Boolean invoiceRequired;

    /**
     * 发票抬头
     */
    private String invoiceTitle;

    /**
     * 纳税人识别号
     */
    private String invoiceTaxNo;

    /**
     * 备注
     */
    private String remark;

    /**
     * 创建人
     */
    private String createdBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    @TableLogic
    private Integer deleteFlag;
}
