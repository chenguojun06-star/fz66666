package com.fashion.supplychain.integration.payment;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 支付响应DTO
 * 支付接口返回的结果
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentResponse {

    /**
     * 是否成功
     */
    private Boolean success;

    /**
     * 系统订单号
     */
    private String orderId;

    /**
     * 第三方支付订单号
     */
    private String thirdPartyOrderId;

    /**
     * 支付状态
     */
    private PaymentStatus status;

    /**
     * 支付链接（PC网页支付）
     */
    private String payUrl;

    /**
     * 二维码内容（扫码支付）
     */
    private String qrCode;

    /**
     * 支付金额（单位：分）
     */
    private Long amount;

    /**
     * 实际支付金额（可能有优惠）
     */
    private Long actualAmount;

    /**
     * 支付完成时间
     */
    private LocalDateTime payTime;

    /**
     * 错误码
     */
    private String errorCode;

    /**
     * 错误信息
     */
    private String errorMessage;

    /**
     * 原始响应数据（JSON格式，用于调试）
     */
    private String rawResponse;

    /**
     * 附加数据
     */
    private String extraData;

    /**
     * 响应时间
     */
    private LocalDateTime responseTime;

    /**
     * 支付状态枚举
     */
    public enum PaymentStatus {
        /**
         * 等待支付
         */
        PENDING("待支付"),

        /**
         * 支付中（用户正在支付）
         */
        PROCESSING("支付中"),

        /**
         * 支付成功
         */
        SUCCESS("支付成功"),

        /**
         * 支付失败
         */
        FAILED("支付失败"),

        /**
         * 已退款
         */
        REFUNDED("已退款"),

        /**
         * 已关闭（超时或用户取消）
         */
        CLOSED("已关闭");

        private final String displayName;

        PaymentStatus(String displayName) {
            this.displayName = displayName;
        }

        public String getDisplayName() {
            return displayName;
        }
    }

    /**
     * 创建成功响应
     */
    public static PaymentResponse success(String orderId, String thirdPartyOrderId) {
        return PaymentResponse.builder()
                .success(true)
                .orderId(orderId)
                .thirdPartyOrderId(thirdPartyOrderId)
                .status(PaymentStatus.PENDING)
                .responseTime(LocalDateTime.now())
                .build();
    }

    /**
     * 创建失败响应
     */
    public static PaymentResponse failure(String orderId, String errorCode, String errorMessage) {
        return PaymentResponse.builder()
                .success(false)
                .orderId(orderId)
                .status(PaymentStatus.FAILED)
                .errorCode(errorCode)
                .errorMessage(errorMessage)
                .responseTime(LocalDateTime.now())
                .build();
    }
}
