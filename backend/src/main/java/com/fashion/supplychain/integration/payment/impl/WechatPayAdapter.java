package com.fashion.supplychain.integration.payment.impl;

import com.fashion.supplychain.integration.payment.PaymentGateway;
import com.fashion.supplychain.integration.payment.PaymentRequest;
import com.fashion.supplychain.integration.payment.PaymentResponse;
import com.fashion.supplychain.integration.payment.channel.WechatPayGatewayClient;
import com.fashion.supplychain.integration.payment.config.PaymentChannelConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 微信支付适配器（Native 主扫 / 查询 / 退款）。
 *
 * <p>只做协议编排，SDK 调用在 {@link WechatPayGatewayClient}。
 * 凭据来自**该租户自己的**收款配置。
 *
 * <p><b>不再有 Mock 分支</b>（历史实现未配置时会返回假二维码，且
 * {@code verifyCallback} 直接放行）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WechatPayAdapter implements PaymentGateway {

    private final WechatPayGatewayClient client;

    @Override
    public String getChannelName() {
        return "微信支付";
    }

    @Override
    public PaymentType getPaymentType() {
        return PaymentType.WECHAT_PAY;
    }

    @Override
    public PaymentResponse createPayment(PaymentChannelConfig cfg, PaymentRequest request)
            throws PaymentException {
        requireUsable(cfg);
        try {
            String codeUrl = client.prepay(cfg, request.getOrderId(),
                    request.getAmount(), request.getSubject());
            log.info("[微信支付] 下单成功 outTradeNo={} amount={}分", request.getOrderId(), request.getAmount());
            return PaymentResponse.builder()
                    .success(true)
                    .orderId(request.getOrderId())
                    .thirdPartyOrderId(request.getOrderId())
                    .status(PaymentResponse.PaymentStatus.PENDING)
                    .qrCode(codeUrl)
                    .amount(request.getAmount())
                    .build();
        } catch (RuntimeException e) {
            throw new PaymentException("WECHAT_ERROR", e.getMessage(), e);
        }
    }

    @Override
    public PaymentResponse queryPayment(PaymentChannelConfig cfg, String orderId,
                                        String thirdPartyOrderId) throws PaymentException {
        requireUsable(cfg);
        try {
            WechatPayGatewayClient.TradeState state = client.query(cfg, orderId);
            return PaymentResponse.builder()
                    .success(true)
                    .orderId(orderId)
                    .thirdPartyOrderId(state.transactionId())
                    .status(state.paid() ? PaymentResponse.PaymentStatus.SUCCESS
                            : state.closed() ? PaymentResponse.PaymentStatus.CLOSED
                            : PaymentResponse.PaymentStatus.PENDING)
                    .actualAmount(state.payerTotalFen() > 0 ? state.payerTotalFen() : null)
                    .build();
        } catch (RuntimeException e) {
            throw new PaymentException("WECHAT_QUERY_ERROR", e.getMessage(), e);
        }
    }

    @Override
    public void closeOrder(PaymentChannelConfig cfg, String orderId) throws PaymentException {
        requireUsable(cfg);
        try {
            client.close(cfg, orderId);
        } catch (RuntimeException e) {
            throw new PaymentException("WECHAT_CLOSE_ERROR", e.getMessage(), e);
        }
    }

    @Override
    public PaymentResponse refund(PaymentChannelConfig cfg, String orderId,
                                  long refundFen, long totalFen, String reason) throws PaymentException {
        requireUsable(cfg);
        try {
            client.refund(cfg, orderId, refundFen, totalFen, reason);
            log.info("[微信支付] 退款已受理 outTradeNo={} refund={}分", orderId, refundFen);
            return PaymentResponse.builder()
                    .success(true)
                    .orderId(orderId)
                    .status(PaymentResponse.PaymentStatus.REFUNDED)
                    .actualAmount(refundFen)
                    .build();
        } catch (RuntimeException e) {
            throw new PaymentException("WECHAT_REFUND_ERROR", e.getMessage(), e);
        }
    }

    private void requireUsable(PaymentChannelConfig cfg) throws PaymentException {
        if (cfg == null) {
            throw new PaymentException("WECHAT_NOT_CONFIGURED", "尚未配置微信支付收款参数");
        }
        if (!cfg.isUsable()) {
            throw new PaymentException("WECHAT_NOT_CONFIGURED",
                    "微信支付收款参数不完整，缺少：" + cfg.missingHint());
        }
    }
}
