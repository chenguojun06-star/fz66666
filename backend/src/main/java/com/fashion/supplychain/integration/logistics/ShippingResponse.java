package com.fashion.supplychain.integration.logistics;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 寄件响应DTO
 * 物流接口返回的结果
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ShippingResponse {

    /**
     * 是否成功
     */
    private Boolean success;

    /**
     * 系统订单号
     */
    private String orderId;

    /**
     * 运单号（快递单号）
     */
    private String trackingNumber;

    /**
     * 物流公司代码
     */
    private String companyCode;

    /**
     * 物流公司名称
     */
    private String companyName;

    /**
     * 运单状态
     */
    private ShipmentStatus status;

    /**
     * 运费（单位：分）
     */
    private Long shippingFee;

    /**
     * 预计送达时间
     */
    private LocalDateTime estimatedDeliveryTime;

    /**
     * 快递员姓名
     */
    private String courierName;

    /**
     * 快递员电话
     */
    private String courierMobile;

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
     * 响应时间
     */
    private LocalDateTime responseTime;

    /**
     * 运单状态枚举
     */
    public enum ShipmentStatus {
        /**
         * 已下单（待揽件）
         */
        ORDERED("已下单"),

        /**
         * 已揽件
         */
        PICKED_UP("已揽件"),

        /**
         * 运输中
         */
        IN_TRANSIT("运输中"),

        /**
         * 派送中
         */
        OUT_FOR_DELIVERY("派送中"),

        /**
         * 已签收
         */
        DELIVERED("已签收"),

        /**
         * 签收异常（拒收/退回）
         */
        EXCEPTION("签收异常"),

        /**
         * 已取消
         */
        CANCELLED("已取消");

        private final String displayName;

        ShipmentStatus(String displayName) {
            this.displayName = displayName;
        }

        public String getDisplayName() {
            return displayName;
        }
    }

    /**
     * 创建成功响应
     */
    public static ShippingResponse success(String orderId, String trackingNumber, String companyCode) {
        return ShippingResponse.builder()
                .success(true)
                .orderId(orderId)
                .trackingNumber(trackingNumber)
                .companyCode(companyCode)
                .status(ShipmentStatus.ORDERED)
                .responseTime(LocalDateTime.now())
                .build();
    }

    /**
     * 创建失败响应
     */
    public static ShippingResponse failure(String orderId, String errorCode, String errorMessage) {
        return ShippingResponse.builder()
                .success(false)
                .orderId(orderId)
                .errorCode(errorCode)
                .errorMessage(errorMessage)
                .responseTime(LocalDateTime.now())
                .build();
    }
}
