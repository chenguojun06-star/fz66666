package com.fashion.supplychain.integration.payment.impl;

import com.fashion.supplychain.integration.payment.PaymentGateway;
import com.fashion.supplychain.integration.payment.PaymentRequest;
import com.fashion.supplychain.integration.payment.PaymentResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 支付宝支付适配器
 *
 * 后期接入步骤：
 * 1. 获取支付宝开放平台密钥（APPID、私钥、公钥）
 * 2. 引入支付宝SDK：com.alipay.sdk:alipay-sdk-java
 * 3. 在 application.yml 配置密钥信息
 * 4. 实现下面的方法逻辑
 *
 * 参考文档：https://opendocs.alipay.com/open/270/105898
 */
@Slf4j
@Service
public class AlipayAdapter implements PaymentGateway {

    // TODO: 后期从配置文件注入
    // @Value("${alipay.app-id}")
    // private String appId;

    // @Value("${alipay.private-key}")
    // private String privateKey;

    // @Value("${alipay.alipay-public-key}")
    // private String alipayPublicKey;

    @Override
    public String getChannelName() {
        return "支付宝";
    }

    @Override
    public PaymentType getPaymentType() {
        return PaymentType.ALIPAY;
    }

    @Override
    public PaymentResponse createPayment(PaymentRequest request) throws PaymentException {
        log.info("[支付宝] 创建支付订单: {}", request.getOrderId());

        // TODO: 实现支付宝支付逻辑
        // 1. 构建支付请求参数
        // 2. 调用支付宝 alipay.trade.page.pay (PC网页支付)
        //    或 alipay.trade.precreate (扫码支付)
        // 3. 解析返回结果

        // 临时返回模拟数据（后期删除）
        log.warn("[支付宝] 当前为模拟实现，需接入真实API");
        return PaymentResponse.builder()
                .success(true)
                .orderId(request.getOrderId())
                .thirdPartyOrderId("ALIPAY_MOCK_" + System.currentTimeMillis())
                .status(PaymentResponse.PaymentStatus.PENDING)
                .payUrl("https://openapi.alipay.com/gateway.do?...")  // 模拟支付链接
                .qrCode("https://qr.alipay.com/...")  // 模拟二维码
                .amount(request.getAmount())
                .build();
    }

    @Override
    public PaymentResponse queryPayment(String orderId, String thirdPartyOrderId) throws PaymentException {
        log.info("[支付宝] 查询支付状态: orderId={}, thirdPartyOrderId={}", orderId, thirdPartyOrderId);

        // TODO: 实现支付宝查询逻辑
        // 调用 alipay.trade.query 接口

        // 临时返回模拟数据
        log.warn("[支付宝] 当前为模拟实现，需接入真实API");
        return PaymentResponse.builder()
                .success(true)
                .orderId(orderId)
                .thirdPartyOrderId(thirdPartyOrderId)
                .status(PaymentResponse.PaymentStatus.SUCCESS)  // 模拟已支付
                .build();
    }

    @Override
    public PaymentResponse refund(String orderId, Long refundAmount, String reason) throws PaymentException {
        log.info("[支付宝] 申请退款: orderId={}, amount={}, reason={}", orderId, refundAmount, reason);

        // TODO: 实现支付宝退款逻辑
        // 调用 alipay.trade.refund 接口

        // 临时返回模拟数据
        log.warn("[支付宝] 当前为模拟实现，需接入真实API");
        return PaymentResponse.builder()
                .success(true)
                .orderId(orderId)
                .status(PaymentResponse.PaymentStatus.REFUNDED)
                .actualAmount(refundAmount)
                .build();
    }

    @Override
    public boolean verifyCallback(String callbackData) {
        log.info("[支付宝] 验证回调签名");

        // TODO: 实现支付宝回调验证
        // 1. 解析回调参数
        // 2. 使用支付宝公钥验证签名
        // 3. 验证订单金额等关键字段

        // 临时返回true（开发环境，后期必须改为真实验证）
        log.warn("[支付宝] 当前为模拟实现，跳过签名验证（⚠️ 生产环境必须验证）");
        return true;
    }
}
