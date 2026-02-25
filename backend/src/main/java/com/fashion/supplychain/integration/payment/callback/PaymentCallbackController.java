package com.fashion.supplychain.integration.payment.callback;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.integration.payment.PaymentGateway;
import com.fashion.supplychain.integration.payment.PaymentManager;
import com.fashion.supplychain.integration.payment.PaymentResponse;
import com.fashion.supplychain.integration.record.entity.IntegrationCallbackLog;
import com.fashion.supplychain.integration.record.service.IntegrationRecordService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
 * ============================================================
 */
@Slf4j
@RestController
@RequestMapping("/api/webhook/payment")
@RequiredArgsConstructor
public class PaymentCallbackController {

    private final PaymentManager paymentManager;
    private final IntegrationRecordService recordService;

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
            // Step 1: 验证签名
            // 将Header信息拼接后传入验证（AdapterImpl中使用SDK验证）
            String callbackData = String.join("|", timestamp, nonce, body, signature, serial);
            boolean valid = paymentManager.verifyCallback(callbackData, PaymentGateway.PaymentType.WECHAT_PAY);

            if (!valid) {
                log.warn("[微信支付回调] 签名验证失败");
                recordService.updateCallbackResult(cbLog.getId(), false, false, null, "签名验证失败");
                return Map.of("code", "FAIL", "message", "签名验证失败");
            }

            // Step 2: 解密并解析回调数据
            // TODO: 接入微信SDK后，使用 NotificationParser 解密 body
            // DecryptNotifyResult result = parser.parse(headers, body, DecryptNotifyResult.class);
            // String orderId = result.getOutTradeNo();
            // String transactionId = result.getTransactionId();
            // String tradeState = result.getTradeState();

            log.info("[微信支付回调] 处理成功（需实现解密逻辑）");
            recordService.updateCallbackResult(cbLog.getId(), true, true, null, null);
            return Map.of("code", "SUCCESS", "message", "成功");

        } catch (Exception e) {
            log.error("[微信支付回调] 处理异常", e);
            recordService.updateCallbackResult(cbLog.getId(), false, false, null, e.getMessage());
            return Map.of("code", "FAIL", "message", e.getMessage());
        }
    }

    // =====================================================
    // 业务处理（支付成功后触发）
    // =====================================================

    /**
     * 支付成功处理
     *
     * TODO: 接入后在这里填写支付成功的业务逻辑：
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

        // 更新支付流水状态为成功
        recordService.updatePaymentStatus(thirdPartyNo, "SUCCESS", null);

        // TODO: 注入业务服务后实现
        // @Autowired private ProductionOrderService orderService;
        // orderService.markAsPaid(orderId, thirdPartyNo, paymentType.name());
    }

    /**
     * 支付关闭/退款处理
     */
    private void handlePaymentClosed(String orderId, PaymentGateway.PaymentType paymentType) {
        log.info("[支付关闭] orderId={} channel={}", orderId, paymentType.getDisplayName());
        // TODO: 更新订单状态为已关闭
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
