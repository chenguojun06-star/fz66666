package com.fashion.supplychain.integration.payment;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 支付请求DTO
 * 发起支付时传递的参数
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentRequest {

    /**
     * 系统订单号（必填）
     */
    private String orderId;

    /**
     * 支付金额（单位：分，必填）
     */
    private Long amount;

    /**
     * 订单标题（必填）
     */
    private String subject;

    /**
     * 订单描述
     */
    private String description;

    /**
     * 支付渠道类型
     */
    private PaymentGateway.PaymentType paymentType;

    /**
     * 买家ID（客户ID）
     */
    private String buyerId;

    /**
     * 买家账号（支付宝账号/微信OpenID等）
     */
    private String buyerAccount;

    /**
     * 支付超时时间（分钟，默认30分钟）
     */
    private Integer timeoutMinutes;

    /**
     * 异步回调地址
     */
    private String notifyUrl;

    /**
     * 同步跳转地址（用户支付完成后跳转）
     */
    private String returnUrl;

    /**
     * 附加数据（会原样返回）
     */
    private String extraData;

    /**
     * 请求时间
     */
    private LocalDateTime requestTime;

    /**
     * 是否需要发票
     */
    private Boolean needInvoice;

    /**
     * 备注
     */
    private String remark;
}
