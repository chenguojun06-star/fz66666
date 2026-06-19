package com.fashion.supplychain.integration.payment.callback;

import com.fashion.supplychain.integration.config.WechatPayProperties;
import com.fashion.supplychain.integration.payment.PaymentGateway;
import com.fashion.supplychain.integration.payment.PaymentManager;
import com.fashion.supplychain.integration.payment.orchestration.PaymentCallbackOrchestrator;
import com.fashion.supplychain.integration.record.entity.IntegrationCallbackLog;
import com.fashion.supplychain.integration.record.service.IntegrationRecordService;
import com.wechat.pay.java.core.RSAAutoCertificateConfig;
import com.wechat.pay.java.core.notification.NotificationParser;
import com.wechat.pay.java.service.payments.model.Transaction;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 支付回调统一控制器（Webhook 接收入口）
 *
 * ============================================================
 * 配置到第三方平台的回调地址：
 * ============================================================
 * 支付宝异步通知：https://你的域名/api/webhook/payment/alipay
 * 微信支付通知：  https://你的域名/api/webhook/payment/wechat
 *
 * 重要须知：
 * - 此 Controller 不需要登录认证（第三方平台直接调用）
 * - 通过签名验证防止伪造
 * - 支付成功后，在 handlePaymentSuccess() 中触发业务逻辑
 * - 所有数据库写操作通过 PaymentCallbackOrchestrator 执行（事务保护）
 * ============================================================
 */
@Slf4j
@RestController
@RequestMapping("/api/webhook/payment")
public class PaymentCallbackController {

    private final PaymentManager paymentManager;
    private final IntegrationRecordService recordService;
    private final PaymentCallbackOrchestrator paymentCallbackOrchestrator;
    private final WechatPayProperties wechatPayProperties;

    @Value("${spring.profiles.active:dev}")
    private String activeProfile;

    public PaymentCallbackController(PaymentManager paymentManager,
                                      IntegrationRecordService recordService,
                                      @Autowired(required = false) PaymentCallbackOrchestrator paymentCallbackOrchestrator,
                                      @Autowired(required = false) WechatPayProperties wechatPayProperties) {
        this.paymentManager = paymentManager;
        this.recordService = recordService;
        this.paymentCallbackOrchestrator = paymentCallbackOrchestrator;
        this.wechatPayProperties = wechatPayProperties;
    }

    // =====================================================
    // 支付宝回调（POST）
    // =====================================================

    /**
     * 支付宝异步通知（alipay.notify_url）
     *
     * 支付宝会多次推送，成功处理后必须返回 "success" 字符串
     * 失败可返回其他内容，支付宝会重试推送（最多8次，间隔递增）
     */
    @PostMapping("/alipay")
    public String alipayCallback(@RequestParam Map<String, String> params) {
        log.info("[支付宝回调] 收到通知 | tradeNo={} status={}",
                params.get("trade_no"), params.get("trade_status"));

        // 先记录原始回调日志（无论后续处理是否成功）
        IntegrationCallbackLog cbLog = recordService.saveCallbackLog(
                "PAYMENT", "ALIPAY", buildAlipayCallbackData(params), null);

        try {
            // Step 1: 验证签名（防伪造）
            boolean valid = paymentManager.verifyCallback(
                    buildAlipayCallbackData(params),
                    PaymentGateway.PaymentType.ALIPAY);

            if (!valid) {
                log.warn("[支付宝回调] 签名验证失败，忽略此通知");
                recordService.updateCallbackResult(cbLog.getId(), false, false, null, "签名验证失败");
                return "fail";
            }

            // Step 2: 解析支付状态
            String tradeStatus = params.get("trade_status");
            String orderId = params.get("out_trade_no");    // 我方系统订单号
            String alipayTradeNo = params.get("trade_no");  // 支付宝流水号

            if ("TRADE_SUCCESS".equals(tradeStatus) || "TRADE_FINISHED".equals(tradeStatus)) {
                log.info("[支付宝回调] 支付成功 | orderId={} alipayNo={}", orderId, alipayTradeNo);
                handlePaymentSuccess(orderId, alipayTradeNo, PaymentGateway.PaymentType.ALIPAY, params);
            } else if ("TRADE_CLOSED".equals(tradeStatus)) {
                log.info("[支付宝回调] 交易关闭 | orderId={}", orderId);
                handlePaymentClosed(orderId, PaymentGateway.PaymentType.ALIPAY);
            }

            recordService.updateCallbackResult(cbLog.getId(), true, true, orderId, null);
            // 必须返回 "success"，否则支付宝认为通知失败，会重试
            return "success";

        } catch (Exception e) {
            log.error("[支付宝回调] 处理异常", e);
            recordService.updateCallbackResult(cbLog.getId(), false, false, null, e.getMessage());
            return "fail";
        }
    }

    // =====================================================
    // 微信支付回调（POST JSON）
    // =====================================================

    /**
     * 微信支付异步通知（V3 API，notify_url）
     *
     * 微信V3回调：POST，Body为加密的JSON
     * 成功返回：{"code":"SUCCESS","message":"成功"}
     * 失败返回：{"code":"FAIL","message":"错误原因"}
     */
    @PostMapping("/wechat")
    public Map<String, String> wechatCallback(
            @RequestHeader(value = "Wechatpay-Timestamp", required = false) String timestamp,
            @RequestHeader(value = "Wechatpay-Nonce", required = false) String nonce,
            @RequestHeader(value = "Wechatpay-Signature", required = false) String signature,
            @RequestHeader(value = "Wechatpay-Serial", required = false) String serial,
            @RequestBody String body) {

        log.info("[微信支付回调] 收到通知 | timestamp={}", timestamp);

        // 先记录原始回调日志
        IntegrationCallbackLog cbLog = recordService.saveCallbackLog(
                "PAYMENT", "WECHAT_PAY", body, null);

        try {
            // 检查是否配置了微信支付
            if (wechatPayProperties == null || !wechatPayProperties.isConfigured()) {
                log.warn("[微信支付回调] 微信支付未配置，跳过处理");
                recordService.updateCallbackResult(cbLog.getId(), false, false, null, "微信支付未配置");
                return Map.of("code", "FAIL", "message", "微信支付未配置");
            }

            // Step 1: 构建验签请求
            com.wechat.pay.java.core.notification.RequestParam requestParam =
                    new com.wechat.pay.java.core.notification.RequestParam.Builder()
                    .serialNumber(serial)
                    .nonce(nonce)
                    .timestamp(timestamp)
                    .signature(signature)
                    .body(body)
                    .build();

            // Step 2: 使用 SDK 验签并解密
            RSAAutoCertificateConfig config = buildWechatConfig();
            NotificationParser parser = new NotificationParser(config);

            // 验签并解密支付通知（SDK 会自动解密并返回 Transaction 对象）
            Transaction transaction = parser.parse(requestParam, Transaction.class);

            log.info("[微信支付回调] 验签解密成功 | outTradeNo={} transactionId={} tradeState={}",
                    transaction.getOutTradeNo(), transaction.getTransactionId(), transaction.getTradeState());

            // Step 3: 根据交易状态处理业务
            String orderId = transaction.getOutTradeNo();
            String thirdPartyNo = transaction.getTransactionId();

            if ("SUCCESS".equals(transaction.getTradeState())) {
                // 支付成功
                log.info("[微信支付回调] 支付成功 | orderId={} wechatNo={}", orderId, thirdPartyNo);
                handlePaymentSuccess(orderId, thirdPartyNo, PaymentGateway.PaymentType.WECHAT_PAY, null);
                recordService.updateCallbackResult(cbLog.getId(), true, true, orderId, null);
                return Map.of("code", "SUCCESS", "message", "成功");
            } else if ("CLOSED".equals(transaction.getTradeState())) {
                // 交易关闭
                log.info("[微信支付回调] 交易关闭 | orderId={}", orderId);
                handlePaymentClosed(orderId, PaymentGateway.PaymentType.WECHAT_PAY);
                recordService.updateCallbackResult(cbLog.getId(), true, true, orderId, null);
                return Map.of("code", "SUCCESS", "message", "成功");
            } else {
                // 其他状态（NOTPAY, PAY_ERROR 等），记录但不更新订单
                log.info("[微信支付回调] 交易状态: {} | orderId={}", transaction.getTradeState(), orderId);
                recordService.updateCallbackResult(cbLog.getId(), true, false, orderId,
                        "交易状态: " + transaction.getTradeState());
                return Map.of("code", "SUCCESS", "message", "成功");
            }

        } catch (NumberFormatException e) {
            log.warn("[微信支付回调] 时间戳格式错误: {}", timestamp, e);
            recordService.updateCallbackResult(cbLog.getId(), false, false, null, "时间戳格式错误");
            return Map.of("code", "FAIL", "message", "时间戳格式错误");
        } catch (Exception e) {
            log.error("[微信支付回调] 处理异常", e);
            recordService.updateCallbackResult(cbLog.getId(), false, false, null, e.getMessage());
            return Map.of("code", "FAIL", "message", e.getMessage());
        }
    }

    /**
     * 构建微信支付 RSA 配置（自动下载平台证书）
     */
    private RSAAutoCertificateConfig buildWechatConfig() {
        return new RSAAutoCertificateConfig.Builder()
                .merchantId(wechatPayProperties.getMchId())
                .privateKeyFromPath(wechatPayProperties.getPrivateKeyPath())
                .merchantSerialNumber(wechatPayProperties.getSerialNo())
                .apiV3Key(wechatPayProperties.getApiV3Key())
                .build();
    }

    // =====================================================
    // 业务处理（支付成功后触发）
    // =====================================================

    /**
     * 支付成功处理
     *
     * 接入支付SDK后填写支付成功的业务逻辑：
     * 1. 更新订单支付状态（order.status → PAID）
     * 2. 触发发货流程
     * 3. 发送支付成功通知（短信/微信消息）
     * 4. 记录支付流水
     *
     * @param orderId        我方系统订单号
     * @param thirdPartyNo   第三方流水号
     * @param paymentType    支付渠道
     * @param rawData        原始回调数据
     */
    private void handlePaymentSuccess(String orderId, String thirdPartyNo,
                                       PaymentGateway.PaymentType paymentType,
                                       Map<String, String> rawData) {
        log.info("[支付成功] orderId={} channel={} thirdPartyNo={}",
                orderId, paymentType.getDisplayName(), thirdPartyNo);

        if (paymentCallbackOrchestrator != null) {
            try {
                paymentCallbackOrchestrator.updatePaymentStatus(thirdPartyNo, "SUCCESS");
                paymentCallbackOrchestrator.handlePaymentSuccess(orderId, thirdPartyNo, paymentType);
            } catch (Exception e) {
                log.error("[支付成功] 订单状态更新失败: orderNo={}", orderId, e);
            }
        } else {
            log.warn("[支付成功] PaymentCallbackOrchestrator 不可用，跳过订单状态更新: orderNo={}", orderId);
        }
    }

    /**
     * 支付关闭/退款处理
     */
    private void handlePaymentClosed(String orderId, PaymentGateway.PaymentType paymentType) {
        log.info("[支付关闭] orderId={} channel={}", orderId, paymentType.getDisplayName());
        if (paymentCallbackOrchestrator != null) {
            try {
                paymentCallbackOrchestrator.handlePaymentClosed(orderId, paymentType);
            } catch (Exception e) {
                log.error("[支付关闭] 订单状态更新失败: orderNo={}", orderId, e);
            }
        }
    }

    // =====================================================
    // 工具方法
    // =====================================================

    private String buildAlipayCallbackData(Map<String, String> params) {
        // 支付宝回调数据包含所有参数（含sign），传给 AlipayAdapter 验签
        StringBuilder sb = new StringBuilder();
        params.forEach((k, v) -> sb.append(k).append("=").append(v).append("&"));
        return sb.toString();
    }
}
