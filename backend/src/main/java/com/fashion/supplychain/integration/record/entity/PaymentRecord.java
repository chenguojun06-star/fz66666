package com.fashion.supplychain.integration.record.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 支付流水记录实体
 * 每次调用支付接口（发起/查询/退款/回调）都会写入一条记录
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("t_payment_record")
public class PaymentRecord {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID */
    private Long tenantId;

    /** 业务订单号（如生产订单号） */
    private String orderId;

    /** 业务类型：production / sample / material */
    @Builder.Default
    private String orderType = "production";

    /** 支付渠道：ALIPAY / WECHAT_PAY */
    private String channel;

    /** 应付金额（分） */
    private Long amount;

    /** 实付金额（分，支付成功后回填） */
    private Long actualAmount;

    /** 状态：PENDING / SUCCESS / FAILED / REFUNDED / CANCELLED */
    @Builder.Default
    private String status = "PENDING";

    /** 第三方平台交易号（支付宝交易号 / 微信支付prepay_id等） */
    private String thirdPartyOrderId;

    /** 支付跳转链接（PC支付页面URL） */
    private String payUrl;

    /** 二维码内容（扫码支付时使用） */
    private String qrCode;

    /** 失败/异常原因 */
    private String errorMessage;

    /** 实际支付时间（回调通知后填入） */
    private LocalDateTime paidTime;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedTime;
}
