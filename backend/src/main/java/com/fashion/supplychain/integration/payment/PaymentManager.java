package com.fashion.supplychain.integration.payment;

import com.fashion.supplychain.integration.payment.config.PaymentChannelConfig;
import com.fashion.supplychain.integration.payment.config.PaymentConfigService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 支付统一管理器（业务层唯一入口）。
 *
 * <p><b>职责</b>：① 按「租户 + 渠道」取出**已解密的商户配置**；
 * ② 交给对应渠道适配器；③ 未配置时抛出**可读的明确错误**。
 *
 * <p><b>与历史实现的区别（重要）</b>：以前密钥来自全局 application.yml，
 * 且未配置时返回"模拟成功"。现在密钥按租户存库、加密保管，
 * 未配置一律拒绝 —— 平台用一个商户号代收所有商家的钱属于二清（无牌照非法经营），
 * 而"模拟成功"会让系统真的发货记账却一分钱没收到。
 *
 * <p>用法：
 * <pre>
 *   PaymentChannelConfig cfg = paymentManager.resolve(tenantId, PaymentType.ALIPAY); // 未配置抛异常
 *   PaymentResponse resp = paymentManager.createPayment(tenantId, request);
 * </pre>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentManager {

    private final List<PaymentGateway> gateways;
    private final PaymentConfigService configService;

    private Map<PaymentGateway.PaymentType, PaymentGateway> gatewayMap;

    /* ── 发起 / 查询 / 退款 ───────────────────────────────────────────────── */

    /** 发起支付（主扫，返回二维码内容） */
    public PaymentResponse createPayment(Long tenantId, PaymentRequest request) {
        PaymentGateway gateway = gateway(request.getPaymentType());
        PaymentChannelConfig cfg = requireConfig(tenantId, request.getPaymentType());
        log.info("[支付] 发起支付 tenant={} channel={} orderId={} amount={}分",
                tenantId, gateway.getChannelName(), request.getOrderId(), request.getAmount());
        try {
            return gateway.createPayment(cfg, request);
        } catch (PaymentGateway.PaymentException e) {
            log.error("[支付] 发起失败 tenant={} orderId={} err={}",
                    tenantId, request.getOrderId(), e.getMessage());
            throw new PaymentException(e.getMessage(), e);
        }
    }

    /**
     * 查询支付状态。
     *
     * <p>为什么必须有它：**回调可能丢**（网络、部署重启、回调地址配错）。
     * 只靠回调会出现"顾客付了钱、系统还是待支付"的悬单。
     */
    public PaymentResponse queryPayment(Long tenantId, String orderId, String thirdPartyOrderId,
                                        PaymentGateway.PaymentType type) {
        PaymentGateway gateway = gateway(type);
        PaymentChannelConfig cfg = requireConfig(tenantId, type);
        try {
            return gateway.queryPayment(cfg, orderId, thirdPartyOrderId);
        } catch (PaymentGateway.PaymentException e) {
            throw new PaymentException("查询支付状态失败：" + e.getMessage(), e);
        }
    }

    /** 关闭渠道订单（超时/取消时释放） */
    public void closeOrder(Long tenantId, String orderId, PaymentGateway.PaymentType type) {
        PaymentGateway gateway = gateway(type);
        PaymentChannelConfig cfg = requireConfig(tenantId, type);
        try {
            gateway.closeOrder(cfg, orderId);
        } catch (PaymentGateway.PaymentException e) {
            throw new PaymentException("关闭支付订单失败：" + e.getMessage(), e);
        }
    }

    /** 退款 */
    public PaymentResponse refund(Long tenantId, String orderId, long refundFen,
                                  long totalFen, String reason,
                                  PaymentGateway.PaymentType type) {
        PaymentGateway gateway = gateway(type);
        PaymentChannelConfig cfg = requireConfig(tenantId, type);
        log.info("[支付] 退款 tenant={} channel={} orderId={} amount={}分",
                tenantId, gateway.getChannelName(), orderId, refundFen);
        try {
            return gateway.refund(cfg, orderId, refundFen, totalFen, reason);
        } catch (PaymentGateway.PaymentException e) {
            throw new PaymentException("退款失败：" + e.getMessage(), e);
        }
    }

    /* ── 配置 ─────────────────────────────────────────────────────────────── */

    /** 取租户渠道配置；未配置/未启用/参数不全 → 抛可读异常（绝不降级为模拟支付） */
    public PaymentChannelConfig requireConfig(Long tenantId, PaymentGateway.PaymentType type) {
        PaymentChannelConfig cfg = configService.load(tenantId, type);
        if (cfg == null) {
            throw new PaymentException("尚未开启" + type.getDisplayName() + "收款，请先在「收款设置」里填写商户参数");
        }
        if (!cfg.isUsable()) {
            throw new PaymentException(type.getDisplayName() + "收款参数不完整，缺少：" + cfg.missingHint());
        }
        return cfg;
    }

    /** 渠道是否可用（前端据此决定展示哪些收款方式） */
    public boolean isChannelReady(Long tenantId, PaymentGateway.PaymentType type) {
        PaymentChannelConfig cfg = configService.load(tenantId, type);
        return cfg != null && cfg.isUsable();
    }

    /** 所有可用渠道名（历史接口保留） */
    public List<String> getAvailableChannels() {
        return gateways.stream().map(PaymentGateway::getChannelName).collect(Collectors.toList());
    }

    /* ── 内部 ─────────────────────────────────────────────────────────────── */

    private PaymentGateway gateway(PaymentGateway.PaymentType type) {
        if (type == null) {
            throw new PaymentException("未指定支付渠道");
        }
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

    /** 支付管理器异常（业务层只需捕获这一个） */
    public static class PaymentException extends RuntimeException {
        public PaymentException(String message) {
            super(message);
        }

        public PaymentException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
