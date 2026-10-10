package com.fashion.supplychain.integration.payment.impl;

import com.fashion.supplychain.integration.payment.PaymentGateway;
import com.fashion.supplychain.integration.payment.PaymentRequest;
import com.fashion.supplychain.integration.payment.PaymentResponse;
import com.fashion.supplychain.integration.payment.channel.AlipayGatewayClient;
import com.fashion.supplychain.integration.payment.config.PaymentChannelConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 支付宝适配器（当面付主扫 / 查询 / 退款）。
 *
 * <p>只做协议编排，协议细节在 {@link AlipayGatewayClient}。
 * 凭据来自**该租户自己的**收款配置，不是全局配置。
 *
 * <p><b>不再有 Mock 分支</b>：历史实现里密钥未配置时会返回一个假二维码、
 * 且回调验签直接放行 —— 那等于"假装收到了钱"，还会让伪造回调通过。
 * 现在未配置就明确抛错。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AlipayAdapter implements PaymentGateway {

    private final AlipayGatewayClient client;

    @Override
    public String getChannelName() {
        return "支付宝";
    }

    @Override
    public PaymentType getPaymentType() {
        return PaymentType.ALIPAY;
    }

    @Override
    public PaymentResponse createPayment(PaymentChannelConfig cfg, PaymentRequest request)
            throws PaymentException {
        requireUsable(cfg);
        try {
            String qrCode = client.precreate(cfg, request.getOrderId(),
                    request.getAmount(), request.getSubject());
            log.info("[支付宝] 下单成功 outTradeNo={} amount={}分", request.getOrderId(), request.getAmount());
            return PaymentResponse.builder()
                    .success(true)
                    .orderId(request.getOrderId())
                    .thirdPartyOrderId(request.getOrderId())
                    .status(PaymentResponse.PaymentStatus.PENDING)
                    .qrCode(qrCode)
                    .amount(request.getAmount())
                    .build();
        } catch (RuntimeException e) {
            throw new PaymentException("ALIPAY_ERROR", e.getMessage(), e);
        }
    }

    @Override
    public PaymentResponse queryPayment(PaymentChannelConfig cfg, String orderId,
                                        String thirdPartyOrderId) throws PaymentException {
        requireUsable(cfg);
        try {
            AlipayGatewayClient.TradeState state = client.query(cfg, orderId);
            return PaymentResponse.builder()
                    .success(true)
                    .orderId(orderId)
                    .thirdPartyOrderId(state.tradeNo())
                    .status(state.paid() ? PaymentResponse.PaymentStatus.SUCCESS
                            : state.closed() ? PaymentResponse.PaymentStatus.CLOSED
                            : PaymentResponse.PaymentStatus.PENDING)
                    .actualAmount(state.totalFen() > 0 ? state.totalFen() : null)
                    .build();
        } catch (RuntimeException e) {
            throw new PaymentException("ALIPAY_QUERY_ERROR", e.getMessage(), e);
        }
    }

    @Override
    public void closeOrder(PaymentChannelConfig cfg, String orderId) throws PaymentException {
        requireUsable(cfg);
        try {
            client.close(cfg, orderId);
        } catch (RuntimeException e) {
            // 关单失败不阻断本地流程（渠道侧有超时自动关闭）
            throw new PaymentException("ALIPAY_CLOSE_ERROR", e.getMessage(), e);
        }
    }

    @Override
    public PaymentResponse refund(PaymentChannelConfig cfg, String orderId,
                                  long refundFen, long totalFen, String reason) throws PaymentException {
        requireUsable(cfg);
        try {
            client.refund(cfg, orderId, refundFen, reason);
            log.info("[支付宝] 退款已受理 outTradeNo={} refund={}分", orderId, refundFen);
            return PaymentResponse.builder()
                    .success(true)
                    .orderId(orderId)
                    .status(PaymentResponse.PaymentStatus.REFUNDED)
                    .actualAmount(refundFen)
                    .build();
        } catch (RuntimeException e) {
            throw new PaymentException("ALIPAY_REFUND_ERROR", e.getMessage(), e);
        }
    }

    private void requireUsable(PaymentChannelConfig cfg) throws PaymentException {
        if (cfg == null) {
            throw new PaymentException("ALIPAY_NOT_CONFIGURED", "尚未配置支付宝收款参数");
        }
        if (!cfg.isUsable()) {
            throw new PaymentException("ALIPAY_NOT_CONFIGURED",
                    "支付宝收款参数不完整，缺少：" + cfg.missingHint());
        }
    }
}
