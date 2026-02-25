package com.fashion.supplychain.integration.payment.impl;

import com.fashion.supplychain.integration.payment.PaymentGateway;
import com.fashion.supplychain.integration.payment.PaymentRequest;
import com.fashion.supplychain.integration.payment.PaymentResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 微信支付适配器
 *
 * 后期接入步骤：
 * 1. 获取微信商户平台密钥（APPID、商户号、API密钥）
 * 2. 引入微信支付SDK：com.github.wechatpay-apiv3:wechatpay-java
 * 3. 在 application.yml 配置密钥信息
 * 4. 实现下面的方法逻辑
 *
 * 参考文档：https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml
 */
@Slf4j
@Service
public class WechatPayAdapter implements PaymentGateway {

    // TODO: 后期从配置文件注入
    // @Value("${wechat.app-id}")
    // private String appId;

    // @Value("${wechat.mch-id}")
    // private String mchId;

    // @Value("${wechat.api-key}")
    // private String apiKey;

    @Override
    public String getChannelName() {
        return "微信支付";
    }

    @Override
    public PaymentType getPaymentType() {
        return PaymentType.WECHAT_PAY;
    }

    @Override
    public PaymentResponse createPayment(PaymentRequest request) throws PaymentException {
        log.info("[微信支付] 创建支付订单: {}", request.getOrderId());

        // TODO: 实现微信支付逻辑
        // 1. 构建支付请求参数
        // 2. 调用微信统一下单接口（Native支付或JSAPI支付）
        // 3. 返回支付二维码或支付参数

        // 临时返回模拟数据
        log.warn("[微信支付] 当前为模拟实现，需接入真实API");
        return PaymentResponse.builder()
                .success(true)
                .orderId(request.getOrderId())
                .thirdPartyOrderId("WX_MOCK_" + System.currentTimeMillis())
                .status(PaymentResponse.PaymentStatus.PENDING)
                .qrCode("weixin://wxpay/bizpayurl?...")  // 模拟微信支付码
                .amount(request.getAmount())
                .build();
    }

    @Override
    public PaymentResponse queryPayment(String orderId, String thirdPartyOrderId) throws PaymentException {
        log.info("[微信支付] 查询支付状态: orderId={}, thirdPartyOrderId={}", orderId, thirdPartyOrderId);

        // TODO: 实现微信支付查询逻辑
        // 调用微信查单接口

        // 临时返回模拟数据
        log.warn("[微信支付] 当前为模拟实现，需接入真实API");
        return PaymentResponse.builder()
                .success(true)
                .orderId(orderId)
                .thirdPartyOrderId(thirdPartyOrderId)
                .status(PaymentResponse.PaymentStatus.SUCCESS)
                .build();
    }

    @Override
    public PaymentResponse refund(String orderId, Long refundAmount, String reason) throws PaymentException {
        log.info("[微信支付] 申请退款: orderId={}, amount={}, reason={}", orderId, refundAmount, reason);

        // TODO: 实现微信支付退款逻辑
        // 调用微信退款接口

        // 临时返回模拟数据
        log.warn("[微信支付] 当前为模拟实现，需接入真实API");
        return PaymentResponse.builder()
                .success(true)
                .orderId(orderId)
                .status(PaymentResponse.PaymentStatus.REFUNDED)
                .actualAmount(refundAmount)
                .build();
    }

    @Override
    public boolean verifyCallback(String callbackData) {
        log.info("[微信支付] 验证回调签名");

        // TODO: 实现微信支付回调验证
        // 1. 解密回调数据
        // 2. 验证签名
        // 3. 验证订单信息

        // 临时返回true（开发环境，后期必须改为真实验证）
        log.warn("[微信支付] 当前为模拟实现，跳过签名验证（⚠️ 生产环境必须验证）");
        return true;
    }
}
