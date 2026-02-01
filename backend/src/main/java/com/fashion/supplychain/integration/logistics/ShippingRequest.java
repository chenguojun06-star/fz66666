package com.fashion.supplychain.integration.logistics;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * 寄件请求DTO
 * 创建运单时传递的参数
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ShippingRequest {

    /**
     * 系统订单号（必填）
     */
    private String orderId;

    /**
     * 物流类型
     */
    private LogisticsService.LogisticsType logisticsType;

    /**
     * 寄件人信息
     */
    private ContactInfo sender;

    /**
     * 收件人信息
     */
    private ContactInfo recipient;

    /**
     * 货物信息
     */
    private CargoInfo cargo;

    /**
     * 服务类型（如：标准快递、特快专递）
     */
    private String serviceType;

    /**
     * 付款方式（寄付/到付）
     */
    private PaymentMethod paymentMethod;

    /**
     * 是否需要保价
     */
    private Boolean needInsurance;

    /**
     * 保价金额（单位：元）
     */
    private BigDecimal insuranceAmount;

    /**
     * 是否需要签回单
     */
    private Boolean needSignReturn;

    /**
     * 预约取件时间
     */
    private String pickupTime;

    /**
     * 备注
     */
    private String remark;

    /**
     * 联系人信息
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ContactInfo {
        /**
         * 姓名
         */
        private String name;

        /**
         * 手机号
         */
        private String mobile;

        /**
         * 省份
         */
        private String province;

        /**
         * 城市
         */
        private String city;

        /**
         * 区县
         */
        private String district;

        /**
         * 详细地址
         */
        private String address;

        /**
         * 完整地址（自动拼接）
         */
        public String getFullAddress() {
            return province + city + district + address;
        }
    }

    /**
     * 货物信息
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CargoInfo {
        /**
         * 货物名称
         */
        private String name;

        /**
         * 货物数量
         */
        private Integer quantity;

        /**
         * 重量（单位：千克）
         */
        private BigDecimal weight;

        /**
         * 体积（单位：立方米）
         */
        private BigDecimal volume;

        /**
         * 货物类型（如：服装、文件）
         */
        private String type;
    }

    /**
     * 付款方式枚举
     */
    public enum PaymentMethod {
        /**
         * 寄付（发件人付款）
         */
        SENDER_PAY("寄付"),

        /**
         * 到付（收件人付款）
         */
        RECIPIENT_PAY("到付"),

        /**
         * 月结（月结账户）
         */
        MONTHLY("月结");

        private final String displayName;

        PaymentMethod(String displayName) {
            this.displayName = displayName;
        }

        public String getDisplayName() {
            return displayName;
        }
    }
}
