package com.fashion.supplychain.integration.payment;

import com.fashion.supplychain.integration.payment.config.PaymentChannelConfig;

/**
 * 统一支付网关接口（各渠道适配器实现）。
 *
 * <p><b>关键约定</b>：每个方法都接收一个**已解密的租户级配置**
 * {@link PaymentChannelConfig}，而不是从全局 application.yml 读密钥 ——
 * 因为每家商户必须用自己的商户号收款（平台代收即二清，见
 * {@code V202710100006__create_payment_config.sql} 的说明）。
 *
 * <p><b>未配置时的行为</b>：一律**抛异常明确拒绝**，绝不返回"模拟成功"。
 * 假装收到钱比收不到钱严重得多（会真的发货、真的记账）。
 */
public interface PaymentGateway {

    /** 渠道展示名，如「支付宝」「微信支付」 */
    String getChannelName();

    /** 渠道类型 */
    PaymentType getPaymentType();

    /**
     * 发起支付（主扫：生成二维码内容）。
     *
     * @param cfg     租户级已解密配置（调用方保证非空且 isUsable）
     * @param request 支付请求（金额单位：分）
     * @return 支付响应，含 {@code qrCode}
     */
    PaymentResponse createPayment(PaymentChannelConfig cfg, PaymentRequest request)
            throws PaymentException;

    /** 查询支付状态（支付结果不能只等回调，回调可能丢） */
    PaymentResponse queryPayment(PaymentChannelConfig cfg, String orderId,
                                 String thirdPartyOrderId) throws PaymentException;

    /**
     * 关闭渠道订单（超时/收银员取消时释放，避免顾客还能继续付款）。
     *
     * <p>关单失败不该阻断本地流程：渠道侧订单本身有超时时间，最终会自动关闭。
     */
    void closeOrder(PaymentChannelConfig cfg, String orderId) throws PaymentException;

    /**
     * 退款。
     *
     * @param totalFen 原订单总额（微信要求 total ≥ refund，部分退款必须给原额）
     */
    PaymentResponse refund(PaymentChannelConfig cfg, String orderId,
                           long refundFen, long totalFen, String reason) throws PaymentException;

    /** 渠道类型枚举 */
    enum PaymentType {
        ALIPAY("支付宝"),
        WECHAT_PAY("微信支付");

        private final String displayName;

        PaymentType(String displayName) {
            this.displayName = displayName;
        }

        public String getDisplayName() {
            return displayName;
        }

        /** 从字符串宽松解析（不区分大小写；无法识别返回 null） */
        public static PaymentType parse(String code) {
            if (code == null) {
                return null;
            }
            for (PaymentType t : values()) {
                if (t.name().equalsIgnoreCase(code.trim())) {
                    return t;
                }
            }
            return null;
        }
    }

    /** 支付异常 */
    class PaymentException extends Exception {
        private final String errorCode;

        public PaymentException(String message) {
            super(message);
            this.errorCode = "UNKNOWN";
        }

        public PaymentException(String errorCode, String message) {
            super(message);
            this.errorCode = errorCode;
        }

        public PaymentException(String errorCode, String message, Throwable cause) {
            super(message, cause);
            this.errorCode = errorCode;
        }

        public String getErrorCode() {
            return errorCode;
        }
    }
}
