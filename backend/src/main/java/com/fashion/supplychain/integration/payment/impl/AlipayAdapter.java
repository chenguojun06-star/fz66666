package com.fashion.supplychain.integration.payment.impl;

import com.fashion.supplychain.integration.config.AlipayProperties;
import com.fashion.supplychain.integration.payment.PaymentGateway;
import com.fashion.supplychain.integration.payment.PaymentRequest;
import com.fashion.supplychain.integration.payment.PaymentResponse;
import com.fashion.supplychain.integration.util.IntegrationHttpClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 支付宝支付适配器
 *
 * ============================================================
 * 接入只需 3 步（拿到密钥就能上线）：
 * ============================================================
 * Step 1. 在 application.yml 填入密钥：
 *   alipay:
 *     enabled: true
 *     app-id: "202xxxxxxxx"
 *     private-key: "MIIEvgIBADANBgkqhkiG..."   # RSA2私钥 PKCS8格式
 *     public-key: "MIIBIjANBgkqhkiG..."        # 支付宝公钥
 *     notify-url: "https://你的域名/api/webhook/payment/alipay"
 *     sandbox: true  # 先用沙箱调试，上线前改 false
 *
 * Step 2. 在 pom.xml 添加 SDK（取消注释）：
 *   <dependency>
 *     <groupId>com.alipay.sdk</groupId>
 *     <artifactId>alipay-sdk-java</artifactId>
 *     <version>4.38.0.ALL</version>
 *   </dependency>
 *
 * Step 3. 在每个方法中，删除第一行 "if (!alipayConfig.isConfigured())" 的 mock 分支，
 *         取消注释 "=== 真实接入 ===" 块内的代码。
 *
 * 支付宝开放平台：https://openhome.alipay.com/dev/workspace
 * ============================================================
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AlipayAdapter implements PaymentGateway {

    /** 配置属性（application.yml 中 alipay.* 自动映射） */
    private final AlipayProperties alipayConfig;

    /** 统一 HTTP 客户端（含超时/重试配置） */
    private final IntegrationHttpClient httpClient;

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
        log.info("[支付宝] 发起支付 | orderId={} amount={}分", request.getOrderId(), request.getAmount());

        // ---- Mock 模式（密钥未配置时，开发调试用） ----
        if (!alipayConfig.isConfigured()) {
            return mockResponse(request.getOrderId(), "ALIPAY_MOCK_", request.getAmount(),
                    "https://qr.alipay.com/[MOCK_QR]");
        }

        // ============================================================
        // === 真实接入（Step 2 引入 SDK 后，取消下方注释即可运行） ===
        // ============================================================
        //
        // DefaultAlipayClient alipayClient = new DefaultAlipayClient(
        //     alipayConfig.getEffectiveGatewayUrl(),
        //     alipayConfig.getAppId(),
        //     alipayConfig.getPrivateKey(),
        //     "JSON", "UTF-8",
        //     alipayConfig.getPublicKey(),
        //     "RSA2"
        // );
        //
        // // 扫码支付（推荐：适合 PC / 小程序端展示二维码）
        // AlipayTradePrecreateRequest alipayRequest = new AlipayTradePrecreateRequest();
        // alipayRequest.setNotifyUrl(alipayConfig.getNotifyUrl());
        // alipayRequest.setBizContent(com.alibaba.fastjson.JSON.toJSONString(java.util.Map.of(
        //     "out_trade_no",    request.getOrderId(),
        //     "total_amount",    String.format("%.2f", request.getAmount() / 100.0),  // 分转元
        //     "subject",         request.getSubject(),
        //     "timeout_express", alipayConfig.getTimeoutExpress()
        // )));
        // AlipayTradePrecreateResponse response = alipayClient.execute(alipayRequest);
        //
        // if (!response.isSuccess()) {
        //     throw new PaymentException("[支付宝] 创建支付失败: " + response.getSubMsg());
        // }
        // return PaymentResponse.builder()
        //     .success(true)
        //     .orderId(request.getOrderId())
        //     .thirdPartyOrderId(response.getOutTradeNo())
        //     .status(PaymentResponse.PaymentStatus.PENDING)
        //     .qrCode(response.getQrCode())  // 二维码内容，前端用 qrcodejs 渲染
        //     .amount(request.getAmount())
        //     .build();
        //
        // ============================================================

        throw new PaymentException("[支付宝] 密钥已配置，请取消注释上方真实接入代码");
    }

    @Override
    public PaymentResponse queryPayment(String orderId, String thirdPartyOrderId) throws PaymentException {
        log.info("[支付宝] 查询状态 | orderId={}", orderId);

        if (!alipayConfig.isConfigured()) {
            return PaymentResponse.builder().success(true).orderId(orderId)
                    .thirdPartyOrderId(thirdPartyOrderId)
                    .status(PaymentResponse.PaymentStatus.PENDING).build();
        }

        // ============================================================
        // === 真实接入 ===
        // ============================================================
        //
        // DefaultAlipayClient alipayClient = buildClient();
        // AlipayTradeQueryRequest request = new AlipayTradeQueryRequest();
        // request.setBizContent(com.alibaba.fastjson.JSON.toJSONString(
        //     java.util.Map.of("out_trade_no", orderId)));
        // AlipayTradeQueryResponse resp = alipayClient.execute(request);
        //
        // if (!resp.isSuccess()) throw new PaymentException("[支付宝] 查询失败: " + resp.getSubMsg());
        //
        // PaymentResponse.PaymentStatus status = switch (resp.getTradeStatus()) {
        //     case "TRADE_SUCCESS", "TRADE_FINISHED" -> PaymentResponse.PaymentStatus.SUCCESS;
        //     case "WAIT_BUYER_PAY"                  -> PaymentResponse.PaymentStatus.PENDING;
        //     case "TRADE_CLOSED"                    -> PaymentResponse.PaymentStatus.CANCELLED;
        //     default -> PaymentResponse.PaymentStatus.PENDING;
        // };
        // return PaymentResponse.builder().success(true).orderId(orderId)
        //     .thirdPartyOrderId(resp.getTradeNo()).status(status)
        //     .actualAmount((long)(Double.parseDouble(resp.getTotalAmount()) * 100))
        //     .build();
        //
        // ============================================================

        throw new PaymentException("[支付宝] 密钥已配置，请取消注释 queryPayment 真实代码");
    }

    @Override
    public PaymentResponse refund(String orderId, Long refundAmount, String reason) throws PaymentException {
        log.info("[支付宝] 退款 | orderId={} amount={}分", orderId, refundAmount);

        if (!alipayConfig.isConfigured()) {
            return PaymentResponse.builder().success(true).orderId(orderId)
                    .status(PaymentResponse.PaymentStatus.REFUNDED)
                    .actualAmount(refundAmount).build();
        }

        // ============================================================
        // === 真实接入 ===
        // ============================================================
        //
        // DefaultAlipayClient alipayClient = buildClient();
        // AlipayTradeRefundRequest request = new AlipayTradeRefundRequest();
        // request.setBizContent(com.alibaba.fastjson.JSON.toJSONString(java.util.Map.of(
        //     "out_trade_no",  orderId,
        //     "refund_amount", String.format("%.2f", refundAmount / 100.0),
        //     "refund_reason", reason
        // )));
        // AlipayTradeRefundResponse resp = alipayClient.execute(request);
        // if (!resp.isSuccess()) throw new PaymentException("[支付宝] 退款失败: " + resp.getSubMsg());
        // return PaymentResponse.builder().success(true).orderId(orderId)
        //     .status(PaymentResponse.PaymentStatus.REFUNDED).actualAmount(refundAmount).build();
        //
        // ============================================================

        throw new PaymentException("[支付宝] 密钥已配置，请取消注释 refund 真实代码");
    }

    @Override
    public boolean verifyCallback(String callbackData) {
        if (!alipayConfig.isConfigured()) {
            log.debug("[支付宝] Mock模式，跳过签名验证");
            return true;
        }

        // ============================================================
        // === 真实接入 ===
        // ============================================================
        //
        // // callbackData 是支付宝 POST 的 application/x-www-form-urlencoded 字符串
        // // PaymentCallbackController 已解析为 Map，此处直接传入
        // Map<String, String[]> paramMap = parseFormData(callbackData);
        // try {
        //     return AlipaySignature.rsaCheckV1(
        //         paramMap,
        //         alipayConfig.getPublicKey(),
        //         "UTF-8",
        //         "RSA2"
        //     );
        // } catch (com.alipay.api.AlipayApiException e) {
        //     log.error("[支付宝] 签名验证异常", e);
        //     return false;
        // }
        //
        // ============================================================

        log.error("[支付宝] 密钥已配置但 verifyCallback 未实现，拒绝回调（安全起见）");
        return false;
    }

    // -----------------------------------------------
    // 私有辅助
    // -----------------------------------------------

    private PaymentResponse mockResponse(String orderId, String prefix, Long amount, String qrCode) {
        log.info("[支付宝] Mock模式 | orderId={}（application.yml 设 alipay.enabled=true 切换真实API）", orderId);
        return PaymentResponse.builder()
                .success(true)
                .orderId(orderId)
                .thirdPartyOrderId(prefix + System.currentTimeMillis())
                .status(PaymentResponse.PaymentStatus.PENDING)
                .qrCode(qrCode)
                .amount(amount)
                .build();
    }
}
