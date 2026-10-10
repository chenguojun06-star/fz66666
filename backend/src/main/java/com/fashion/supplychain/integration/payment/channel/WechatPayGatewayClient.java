package com.fashion.supplychain.integration.payment.channel;

import com.fashion.supplychain.integration.payment.config.PaymentChannelConfig;
import com.wechat.pay.java.core.RSAAutoCertificateConfig;
import com.wechat.pay.java.core.notification.NotificationParser;
import com.wechat.pay.java.core.notification.RequestParam;
import com.wechat.pay.java.service.payments.model.Transaction;
import com.wechat.pay.java.service.payments.nativepay.NativePayService;
import com.wechat.pay.java.service.payments.nativepay.model.Amount;
import com.wechat.pay.java.service.payments.nativepay.model.CloseOrderRequest;
import com.wechat.pay.java.service.payments.nativepay.model.PrepayRequest;
import com.wechat.pay.java.service.payments.nativepay.model.PrepayResponse;
import com.wechat.pay.java.service.payments.nativepay.model.QueryOrderByOutTradeNoRequest;
import com.wechat.pay.java.service.refund.RefundService;
import com.wechat.pay.java.service.refund.model.AmountReq;
import com.wechat.pay.java.service.refund.model.CreateRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 微信支付 V3 网关客户端（Native 扫码 / 查询 / 关单 / 退款 / 回调验签解密）。
 *
 * <p>用官方 {@code wechatpay-java} SDK（已在依赖里），而不是手写协议：
 * V3 的签名、平台证书轮换、回调解密（AEAD_AES_256_GCM）都比支付宝复杂，
 * 官方 SDK 能把这些容易出错的地方做对。
 *
 * <p><b>Native 支付</b>：PC/收银台屏幕上展示二维码，顾客用微信扫码付款。
 * 需要在微信商户平台开通「Native 支付」，且 notify_url 域名已备案。
 *
 * <p><b>配置缓存</b>：{@code RSAAutoCertificateConfig} 构建时会去微信服务器
 * 下载平台证书（有网络开销），且 SDK 内部会按它缓存证书。所以这里按
 * 「租户+渠道+证书序列号」缓存实例 —— 换了证书序列号自然换 key，不会用到旧证书。
 */
@Slf4j
@Component
public class WechatPayGatewayClient {

    /** 配置实例缓存上限（租户数远小于此值，纯属兜底防内存泄漏） */
    private static final int MAX_CACHE = 200;

    private final Map<String, RSAAutoCertificateConfig> configCache = new ConcurrentHashMap<>();

    /* ── 主扫：Native 下单，拿到二维码内容 ─────────────────────────────────── */

    /**
     * Native 下单（{@code /v3/pay/transactions/native}）。
     *
     * @return code_url —— 前端把它渲染成二维码即可
     */
    public String prepay(PaymentChannelConfig cfg, String outTradeNo,
                         long amountFen, String subject) {
        PrepayRequest request = new PrepayRequest();
        request.setAppid(cfg.getAppId());
        request.setMchid(cfg.getMchId());
        request.setOutTradeNo(outTradeNo);
        request.setDescription(truncate(subject, 120));
        request.setNotifyUrl(cfg.getNotifyUrl());
        Amount amount = new Amount();
        amount.setTotal(Math.toIntExact(amountFen));
        amount.setCurrency("CNY");
        request.setAmount(amount);

        try {
            PrepayResponse resp = nativeService(cfg).prepay(request);
            if (resp == null || !StringUtils.hasText(resp.getCodeUrl())) {
                throw new IllegalStateException("[微信支付] 下单未返回二维码");
            }
            return resp.getCodeUrl();
        } catch (RuntimeException e) {
            throw new IllegalStateException("[微信支付] 下单失败：" + e.getMessage(), e);
        }
    }

    /* ── 查询 ─────────────────────────────────────────────────────────────── */

    public TradeState query(PaymentChannelConfig cfg, String outTradeNo) {
        QueryOrderByOutTradeNoRequest request = new QueryOrderByOutTradeNoRequest();
        request.setMchid(cfg.getMchId());
        request.setOutTradeNo(outTradeNo);
        try {
            Transaction tx = nativeService(cfg).queryOrderByOutTradeNo(request);
            if (tx == null) {
                return new TradeState("NOTPAY", null, 0L);
            }
            Transaction.TradeStateEnum state = tx.getTradeState();
            long payerTotal = tx.getAmount() == null || tx.getAmount().getPayerTotal() == null
                    ? 0L : tx.getAmount().getPayerTotal();
            return new TradeState(state == null ? "UNKNOWN" : state.name(),
                    tx.getTransactionId(), payerTotal);
        } catch (RuntimeException e) {
            // 订单不存在时 SDK 会抛业务异常：按"未支付"处理，交给上层决定
            log.info("[微信支付] 查询未命中或异常 outTradeNo={} err={}", outTradeNo, e.getMessage());
            return new TradeState("NOTPAY", null, 0L);
        }
    }

    /* ── 关单 / 退款 ──────────────────────────────────────────────────────── */

    /** 关闭订单（超时未支付时释放） */
    public void close(PaymentChannelConfig cfg, String outTradeNo) {
        CloseOrderRequest request = new CloseOrderRequest();
        request.setMchid(cfg.getMchId());
        request.setOutTradeNo(outTradeNo);
        try {
            nativeService(cfg).closeOrder(request);
        } catch (RuntimeException e) {
            // 关单失败不该阻断业务：订单本身有超时时间，微信会自动关闭
            log.warn("[微信支付] 关单失败 outTradeNo={} err={}", outTradeNo, e.getMessage());
        }
    }

    /** 退款（需同时给原订单总额，微信要求 total >= refund） */
    public void refund(PaymentChannelConfig cfg, String outTradeNo,
                       long refundFen, long totalFen, String reason) {
        CreateRequest request = new CreateRequest();
        request.setOutTradeNo(outTradeNo);
        request.setOutRefundNo("RF" + outTradeNo + System.currentTimeMillis() % 100000);
        if (StringUtils.hasText(reason)) {
            request.setReason(truncate(reason, 80));
        }
        AmountReq amount = new AmountReq();
        amount.setRefund(refundFen);
        amount.setTotal(totalFen);
        amount.setCurrency("CNY");
        request.setAmount(amount);
        try {
            RefundService service = new RefundService.Builder().config(config(cfg)).build();
            service.create(request);
        } catch (RuntimeException e) {
            throw new IllegalStateException("[微信支付] 退款失败：" + e.getMessage(), e);
        }
    }

    /* ── 回调验签 + 解密 ──────────────────────────────────────────────────── */

    /**
     * 校验并解密微信支付回调。
     *
     * <p>SDK 会做三件事：验签（用微信平台证书）、解密（AEAD_AES_256_GCM，用 APIv3 密钥）、
     * 反序列化。**任何一步失败都抛异常** —— 调用方必须当作"不可信"处理。
     *
     * <p>还会校验解密出来的 {@code mchid} 与配置一致：防止别人拿自己的商户号
     * 往我们的回调地址推消息。
     */
    public Transaction parseCallback(PaymentChannelConfig cfg, String timestamp, String nonce,
                                     String signature, String serial, String body) {
        if (cfg == null || !cfg.isUsable()) {
            throw new IllegalStateException("微信支付未配置或参数不完整");
        }
        RequestParam requestParam = new RequestParam.Builder()
                .serialNumber(serial)
                .nonce(nonce)
                .timestamp(timestamp)
                .signature(signature)
                .body(body)
                .build();
        Transaction tx = new NotificationParser(config(cfg)).parse(requestParam, Transaction.class);
        if (tx == null) {
            throw new IllegalStateException("回调内容为空");
        }
        if (StringUtils.hasText(tx.getMchid()) && !tx.getMchid().equals(cfg.getMchId())) {
            throw new IllegalStateException("回调商户号与本店配置不一致");
        }
        return tx;
    }

    /* ── 内部 ─────────────────────────────────────────────────────────────── */

    private NativePayService nativeService(PaymentChannelConfig cfg) {
        return new NativePayService.Builder().config(config(cfg)).build();
    }

    /**
     * 取（并缓存）SDK 配置实例。
     *
     * <p>密钥以 PEM 字符串直接传入，**不落盘**：商家私钥只存在于加密后的数据库列
     * 与这里的内存里。
     */
    private RSAAutoCertificateConfig config(PaymentChannelConfig cfg) {
        String key = cfg.getTenantId() + ":" + cfg.getChannel() + ":"
                + cfg.getMchId() + ":" + cfg.getSerialNo();
        RSAAutoCertificateConfig cached = configCache.get(key);
        if (cached != null) {
            return cached;
        }
        if (configCache.size() >= MAX_CACHE) {
            configCache.clear();
        }
        RSAAutoCertificateConfig built = new RSAAutoCertificateConfig.Builder()
                .merchantId(cfg.getMchId())
                .privateKey(cfg.getPrivateKey())
                .merchantSerialNumber(cfg.getSerialNo())
                .apiV3Key(cfg.getApiV3Key())
                .build();
        configCache.put(key, built);
        return built;
    }

    private static String truncate(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() <= max ? s : s.substring(0, max);
    }

    /** 交易状态查询结果（与支付宝那边同构，便于上层统一处理） */
    public record TradeState(String tradeState, String transactionId, long payerTotalFen) {

        public boolean paid() {
            return "SUCCESS".equals(tradeState);
        }

        public boolean closed() {
            return "CLOSED".equals(tradeState) || "REVOKED".equals(tradeState);
        }
    }
}
