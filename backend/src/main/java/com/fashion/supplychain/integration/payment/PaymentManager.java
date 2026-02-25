package com.fashion.supplychain.integration.payment;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.integration.record.service.IntegrationRecordService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 支付统一管理器（业务层唯一入口）
 *
 * ============================================================
 * 业务层使用方式（无需关心底层用的哪个支付渠道）：
 * ============================================================
 * <pre>
 *   // 发起支付
 *   PaymentRequest req = PaymentRequest.builder()
 *       .orderId("PO2026001")
 *       .amount(58800L)          // 单位：分（588元）
 *       .subject("服装供应链货款")
 *       .paymentType(PaymentGateway.PaymentType.ALIPAY)
 *       .notifyUrl("https://你的域名/api/webhook/payment/alipay")
 *       .build();
 *   PaymentResponse resp = paymentManager.createPayment(req);
 *   String qrCodeUrl = resp.getQrCode();   // 展示给客户扫码
 *
 *   // 查询支付状态
 *   PaymentResponse status = paymentManager.queryPayment(
 *       orderId, thirdPartyOrderId, PaymentGateway.PaymentType.ALIPAY);
 *
 *   // 申请退款
 *   paymentManager.refund(orderId, 58800L, "客户取消订单", PaymentGateway.PaymentType.ALIPAY);
 * </pre>
 *
 * 渠道启用控制：
 * - alipay.enabled=false → 该渠道不可用（抛 ChannelNotEnabledException）
 * - alipay.enabled=true + 密钥已填 → 使用真实API
 * ============================================================
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentManager {

    /** Spring 自动注入所有 PaymentGateway 实现 */
    private final List<PaymentGateway> gateways;

    /** 集成跟踪记录服务（自动记录每次调用） */
    private final IntegrationRecordService recordService;

    /** 按类型缓存（lazy init） */
    private Map<PaymentGateway.PaymentType, PaymentGateway> gatewayMap;

    // =====================================================
    // 核心业务方法
    // =====================================================

    /**
     * 发起支付
     * @param request 支付请求（必须设置 paymentType）
     */
    public PaymentResponse createPayment(PaymentRequest request) {
        PaymentGateway gateway = getGateway(request.getPaymentType());
        log.info("[支付] 发起支付 | channel={} orderId={} amount={}分",
                gateway.getChannelName(), request.getOrderId(), request.getAmount());
        Long tenantId = UserContext.tenantId();
        try {
            PaymentResponse resp = gateway.createPayment(request);
            // 自动记录支付流水
            recordService.savePaymentRecord(tenantId, request.getOrderId(),
                    gateway.getChannelName(), request.getAmount(),
                    resp.getThirdPartyOrderId(), resp.getPayUrl(), resp.getQrCode());
            return resp;
        } catch (PaymentGateway.PaymentException e) {
            log.error("[支付] 发起支付失败 | channel={} orderId={}", gateway.getChannelName(), request.getOrderId(), e);
            // 记录失败流水
            recordService.savePaymentFailure(tenantId, request.getOrderId(),
                    gateway.getChannelName(), request.getAmount(), e.getMessage());
            throw new PaymentException("支付失败: " + e.getMessage(), e);
        }
    }

    /**
     * 查询支付状态
     */
    public PaymentResponse queryPayment(String orderId, String thirdPartyOrderId,
                                         PaymentGateway.PaymentType type) {
        PaymentGateway gateway = getGateway(type);
        log.info("[支付] 查询状态 | channel={} orderId={}", gateway.getChannelName(), orderId);
        try {
            return gateway.queryPayment(orderId, thirdPartyOrderId);
        } catch (PaymentGateway.PaymentException e) {
            throw new PaymentException("查询支付状态失败: " + e.getMessage(), e);
        }
    }

    /**
     * 申请退款
     */
    public PaymentResponse refund(String orderId, Long refundAmount, String reason,
                                   PaymentGateway.PaymentType type) {
        PaymentGateway gateway = getGateway(type);
        log.info("[支付] 申请退款 | channel={} orderId={} amount={}分",
                gateway.getChannelName(), orderId, refundAmount);
        try {
            PaymentResponse resp = gateway.refund(orderId, refundAmount, reason);
            // 退款成功：更新支付流水状态
            recordService.updatePaymentStatus(orderId, "REFUNDED", refundAmount);
            return resp;
        } catch (PaymentGateway.PaymentException e) {
            throw new PaymentException("申请退款失败: " + e.getMessage(), e);
        }
    }

    /**
     * 验证支付回调（在 Webhook Controller 中使用）
     */
    public boolean verifyCallback(String callbackData, PaymentGateway.PaymentType type) {
        return getGateway(type).verifyCallback(callbackData);
    }

    /**
     * 获取所有可用渠道
     */
    public List<String> getAvailableChannels() {
        return gateways.stream()
                .map(PaymentGateway::getChannelName)
                .collect(Collectors.toList());
    }

    // =====================================================
    // 内部工具
    // =====================================================

    private PaymentGateway getGateway(PaymentGateway.PaymentType type) {
        if (gatewayMap == null) {
            gatewayMap = gateways.stream()
                    .collect(Collectors.toMap(PaymentGateway::getPaymentType, Function.identity()));
        }
        PaymentGateway gateway = gatewayMap.get(type);
        if (gateway == null) {
            throw new PaymentException("不支持的支付渠道: " + type);
        }
        return gateway;
    }

    /** 支付管理器异常 */
    public static class PaymentException extends RuntimeException {
        public PaymentException(String message) { super(message); }
        public PaymentException(String message, Throwable cause) { super(message, cause); }
    }
}
