package com.fashion.supplychain.integration.payment;

/**
 * 统一支付网关接口
 * 定义与第三方支付平台交互的标准行为
 *
 * 使用方式：
 * 1. 后期获取支付API后，在对应的Adapter中实现具体逻辑
 * 2. 通过PaymentType选择不同的支付渠道
 * 3. 系统会自动处理支付回调和状态同步
 */
public interface PaymentGateway {

    /**
     * 获取支付渠道名称
     * @return 如 "支付宝", "微信支付", "银行转账"
     */
    String getChannelName();

    /**
     * 获取支付渠道类型
     * @return PaymentType枚举
     */
    PaymentType getPaymentType();

    /**
     * 创建支付订单（发起支付）
     *
     * @param request 支付请求参数
     * @return 支付响应（包含支付链接、二维码等）
     * @throws PaymentException 支付失败时抛出
     */
    PaymentResponse createPayment(PaymentRequest request) throws PaymentException;

    /**
     * 查询支付状态
     *
     * @param orderId 系统订单号
     * @param thirdPartyOrderId 第三方支付订单号
     * @return 支付响应（包含当前状态）
     * @throws PaymentException 查询失败时抛出
     */
    PaymentResponse queryPayment(String orderId, String thirdPartyOrderId) throws PaymentException;

    /**
     * 申请退款
     *
     * @param orderId 原订单号
     * @param refundAmount 退款金额（单位：分）
     * @param reason 退款原因
     * @return 退款响应
     * @throws PaymentException 退款失败时抛出
     */
    PaymentResponse refund(String orderId, Long refundAmount, String reason) throws PaymentException;

    /**
     * 验证支付回调签名
     *
     * @param callbackData 回调数据
     * @return 是否验证通过
     */
    boolean verifyCallback(String callbackData);

    /**
     * 支付渠道类型枚举
     */
    enum PaymentType {
        ALIPAY("支付宝"),
        WECHAT_PAY("微信支付"),
        BANK_TRANSFER("银行转账"),
        CASH("现金");

        private final String displayName;

        PaymentType(String displayName) {
            this.displayName = displayName;
        }

        public String getDisplayName() {
            return displayName;
        }
    }

    /**
     * 支付异常类
     */
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
