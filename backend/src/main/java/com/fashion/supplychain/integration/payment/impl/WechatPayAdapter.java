package com.fashion.supplychain.integration.payment.impl;

import com.fashion.supplychain.integration.config.WechatPayProperties;
import com.fashion.supplychain.integration.payment.PaymentGateway;
import com.fashion.supplychain.integration.payment.PaymentRequest;
import com.fashion.supplychain.integration.payment.PaymentResponse;
import com.fashion.supplychain.integration.util.IntegrationHttpClient;
import com.fashion.supplychain.integration.util.SignatureUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 微信支付适配器
 *
 * ============================================================
 * 接入只需 3 步（拿到密钥就能上线）：
 * ============================================================
 * Step 1. 在 application.yml 填入密钥：
 *   wechat-pay:
 *     enabled: true
 *     app-id: "wx..."          # 公众号/小程序/APP的AppID
 *     mch-id: "1234567890"     # 商户号
 *     api-v3-key: "xxxxx..."   # API V3 密钥（32位）
 *     serial-no: "xxxxx"       # 商户证书序列号
 *     private-key-path: "classpath:cert/apiclient_key.pem"
 *     notify-url: "https://你的域名/api/webhook/payment/wechat"
 *
 * Step 2. 在 pom.xml 添加 SDK（取消注释）：
 *   <dependency>
 *     <groupId>com.github.wechatpay-apiv3</groupId>
 *     <artifactId>wechatpay-java</artifactId>
 *     <version>0.2.14</version>
 *   </dependency>
 *
 * Step 3. 在每个方法中，删除 "if (!wechatPayConfig.isConfigured())" 的 mock 分支，
 *         取消注释 "=== 真实接入 ===" 块内的代码。
 *
 * 微信支付商户平台：https://pay.weixin.qq.com
 * 开发文档：https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml
 * ============================================================
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WechatPayAdapter implements PaymentGateway {

    /** 配置属性（application.yml 中 wechat-pay.* 自动映射） */
    private final WechatPayProperties wechatPayConfig;

    /** 统一 HTTP 客户端 */
    private final IntegrationHttpClient httpClient;

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
        log.info("[微信支付] 发起支付 | orderId={} amount={}分", request.getOrderId(), request.getAmount());

        // ---- Mock 模式（密钥未配置时） ----
        if (!wechatPayConfig.isConfigured()) {
            return mockResponse(request.getOrderId(), "WX_MOCK_", request.getAmount());
        }

        // ============================================================
        // === 真实接入（Step 2 引入 SDK 后取消注释） ===
        // ============================================================
        //
        // // 初始化微信支付 V3 客户端（自动下载和刷新平台证书）
        // RSAAutoCertificateConfig config = new RSAAutoCertificateConfig.Builder()
        //     .merchantId(wechatPayConfig.getMchId())
        //     .privateKeyFromPath(wechatPayConfig.getPrivateKeyPath())
        //     .merchantSerialNumber(wechatPayConfig.getSerialNo())
        //     .apiV3Key(wechatPayConfig.getApiV3Key())
        //     .build();
        //
        // // Native 支付（PC 端扫码支付）
        // NativePayService service = new NativePayService.Builder().config(config).build();
        // PrepayRequest prepayRequest = new PrepayRequest();
        // Amount amount = new Amount();
        // amount.setTotal((int)(long) request.getAmount());  // 单位：分
        // amount.setCurrency("CNY");
        // prepayRequest.setAmount(amount);
        // prepayRequest.setAppid(wechatPayConfig.getAppId());
        // prepayRequest.setMchid(wechatPayConfig.getMchId());
        // prepayRequest.setDescription(request.getSubject());
        // prepayRequest.setNotifyUrl(wechatPayConfig.getNotifyUrl());
        // prepayRequest.setOutTradeNo(request.getOrderId());
        //
        // PrepayResponse response = service.prepay(prepayRequest);
        //
        // return PaymentResponse.builder()
        //     .success(true)
        //     .orderId(request.getOrderId())
        //     .thirdPartyOrderId(request.getOrderId())  // 微信以 out_trade_no 为主
        //     .status(PaymentResponse.PaymentStatus.PENDING)
        //     .qrCode(response.getCodeUrl())  // 二维码内容，前端 qrcodejs 渲染
        //     .amount(request.getAmount())
        //     .build();
        //
        // ============================================================

        throw new PaymentException("[微信支付] 密钥已配置，请取消注释上方真实接入代码");
    }

    @Override
    public PaymentResponse queryPayment(String orderId, String thirdPartyOrderId) throws PaymentException {
        log.info("[微信支付] 查询状态 | orderId={}", orderId);

        if (!wechatPayConfig.isConfigured()) {
            return PaymentResponse.builder().success(true).orderId(orderId)
                    .thirdPartyOrderId(thirdPartyOrderId)
                    .status(PaymentResponse.PaymentStatus.PENDING).build();
        }

        // ============================================================
        // === 真实接入 ===
        // ============================================================
        //
        // RSAAutoCertificateConfig config = buildConfig();
        // NativePayService service = new NativePayService.Builder().config(config).build();
        // QueryOrderByOutTradeNoRequest request = new QueryOrderByOutTradeNoRequest();
        // request.setMchid(wechatPayConfig.getMchId());
        // request.setOutTradeNo(orderId);
        // Transaction transaction = service.queryOrderByOutTradeNo(request);
        //
        // PaymentResponse.PaymentStatus status = switch (transaction.getTradeState()) {
        //     case SUCCESS  -> PaymentResponse.PaymentStatus.SUCCESS;
        //     case NOTPAY   -> PaymentResponse.PaymentStatus.PENDING;
        //     case CLOSED   -> PaymentResponse.PaymentStatus.CANCELLED;
        //     case REFUND   -> PaymentResponse.PaymentStatus.REFUNDED;
        //     default       -> PaymentResponse.PaymentStatus.PENDING;
        // };
        // return PaymentResponse.builder().success(true).orderId(orderId)
        //     .thirdPartyOrderId(transaction.getTransactionId())
        //     .status(status)
        //     .actualAmount((long) transaction.getAmount().getPayerTotal())
        //     .build();
        //
        // ============================================================

        throw new PaymentException("[微信支付] 密钥已配置，请取消注释 queryPayment 真实代码");
    }

    @Override
    public PaymentResponse refund(String orderId, Long refundAmount, String reason) throws PaymentException {
        log.info("[微信支付] 退款 | orderId={} amount={}分", orderId, refundAmount);

        if (!wechatPayConfig.isConfigured()) {
            return PaymentResponse.builder().success(true).orderId(orderId)
                    .status(PaymentResponse.PaymentStatus.REFUNDED)
                    .actualAmount(refundAmount).build();
        }

        // ============================================================
        // === 真实接入 ===
        // ============================================================
        //
        // RSAAutoCertificateConfig config = buildConfig();
        // RefundService refundService = new RefundService.Builder().config(config).build();
        // CreateRequest createRequest = new CreateRequest();
        // createRequest.setOutTradeNo(orderId);
        // createRequest.setOutRefundNo("REFUND_" + orderId + "_" + System.currentTimeMillis());
        // createRequest.setReason(reason);
        // AmountReq amountReq = new AmountReq();
        // amountReq.setRefund(refundAmount);
        // amountReq.setTotal(refundAmount);  // 此处如需部分退款需传原始金额
        // amountReq.setCurrency("CNY");
        // createRequest.setAmount(amountReq);
        // Refund refund = refundService.create(createRequest);
        //
        // return PaymentResponse.builder().success(true).orderId(orderId)
        //     .status(PaymentResponse.PaymentStatus.REFUNDED)
        //     .actualAmount(refundAmount).build();
        //
        // ============================================================

        throw new PaymentException("[微信支付] 密钥已配置，请取消注释 refund 真实代码");
    }

    @Override
    public boolean verifyCallback(String callbackData) {
        if (!wechatPayConfig.isConfigured()) {
            log.debug("[微信支付] Mock模式，跳过签名验证");
            return true;
        }

        // ============================================================
        // === 真实接入 ===
        // ============================================================
        //
        // // 微信 V3 回调验签（从 HTTP Header 中获取 Wechatpay-Signature 等）
        // // PaymentCallbackController 已提取 header 信息，callbackData 为请求体
        // // 使用 wechatpay-java SDK 的 NotificationParser 解析
        // //
        // // RSAAutoCertificateConfig config = buildConfig();
        // // NotificationConfig notificationConfig = new RSAAutoCertificateConfig.Builder()
        // //     .merchantId(wechatPayConfig.getMchId())
        // //     ...build();
        // // NotificationParser parser = new NotificationParser(config);
        // // Transaction transaction = parser.parse(requestParam, Transaction.class);
        // // return transaction != null;
        //
        // ============================================================

        log.error("[微信支付] 密钥已配置但 verifyCallback 未实现，拒绝回调（安全起见）");
        return false;
    }

    // -----------------------------------------------
    // 私有辅助
    // -----------------------------------------------

    private PaymentResponse mockResponse(String orderId, String prefix, Long amount) {
        log.info("[微信支付] Mock模式 | orderId={}（application.yml 设 wechat-pay.enabled=true 切换真实API）", orderId);
        return PaymentResponse.builder()
                .success(true)
                .orderId(orderId)
                .thirdPartyOrderId(prefix + System.currentTimeMillis())
                .status(PaymentResponse.PaymentStatus.PENDING)
                .qrCode("weixin://wxpay/bizpayurl?[MOCK]")
                .amount(amount)
                .build();
    }
}
