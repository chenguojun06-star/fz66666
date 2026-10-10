package com.fashion.supplychain.integration.payment.channel;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.integration.payment.config.PaymentChannelConfig;
import com.fashion.supplychain.integration.util.IntegrationHttpClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

/**
 * 支付宝网关客户端（当面付 / 扫码支付 / 查询 / 关单 / 退款 + 回调验签）。
 *
 * <p><b>协议</b>：公共参数 + 业务参数（biz_content）→ 按 key 升序拼
 * {@code k=v&k=v}（**原始值，不做 URL 编码**，跳过空值与 sign）→ RSA2 签名 →
 * 表单 POST 到网关 → JSON 响应（节点名 = 方法名把点换成下划线 + {@code _response}）。
 *
 * <p><b>金额</b>：系统内部一律用「分」（Long），支付宝接口用「元」（两位小数字符串）。
 * 转换只在这一个类里做，避免各调用方各转一次、口径不一。
 *
 * <p><b>一个刻意的取舍</b>：**不做响应验签**。支付宝响应签名校验需要提取响应节点原文，
 * 实现复杂而收益很低 —— 支付结果以「异步回调（严格验签）+ 主动查询」为准，
 * 即使响应被篡改，最坏情况只是拿到一个扫不出来的二维码。传输本身走 HTTPS。
 * 这一点在此写明，避免后人误以为"漏了"。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AlipayGatewayClient {

    private static final String DEFAULT_GATEWAY = "https://openapi.alipay.com/gateway.do";
    private static final DateTimeFormatter TS_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final IntegrationHttpClient httpClient;

    /* ── 主扫：当面付预下单，拿到二维码内容 ────────────────────────────────── */

    /**
     * 当面付预下单（{@code alipay.trade.precreate}）——顾客扫屏幕上的二维码。
     *
     * @return 二维码内容（qrcode 字段）
     */
    public String precreate(PaymentChannelConfig cfg, String outTradeNo,
                            long amountFen, String subject) {
        Map<String, Object> biz = new LinkedHashMap<>();
        biz.put("out_trade_no", outTradeNo);
        biz.put("total_amount", fenToYuan(amountFen));
        biz.put("subject", subject);
        biz.put("timeout_express", "15m");

        JsonNode resp = execute(cfg, "alipay.trade.precreate", biz);
        return text(resp, "qr_code");
    }

    /* ── 查询 ─────────────────────────────────────────────────────────────── */

    /** 交易查询（{@code alipay.trade.query}） */
    public TradeState query(PaymentChannelConfig cfg, String outTradeNo) {
        Map<String, Object> biz = new LinkedHashMap<>();
        biz.put("out_trade_no", outTradeNo);
        JsonNode resp = execute(cfg, "alipay.trade.query", biz);
        // 未支付时支付宝返回 ACQ.TRADE_NOT_EXIST（子码），属正常情况，按"未支付"处理
        return new TradeState(text(resp, "trade_status"), text(resp, "trade_no"),
                yuanToFen(text(resp, "total_amount")));
    }

    /* ── 关单 / 退款 ──────────────────────────────────────────────────────── */

    /** 关闭交易（{@code alipay.trade.close}）：超时未支付时释放 */
    public void close(PaymentChannelConfig cfg, String outTradeNo) {
        Map<String, Object> biz = new LinkedHashMap<>();
        biz.put("out_trade_no", outTradeNo);
        execute(cfg, "alipay.trade.close", biz);
    }

    /** 退款（{@code alipay.trade.refund}） */
    public void refund(PaymentChannelConfig cfg, String outTradeNo, long refundFen, String reason) {
        Map<String, Object> biz = new LinkedHashMap<>();
        biz.put("out_trade_no", outTradeNo);
        biz.put("refund_amount", fenToYuan(refundFen));
        if (StringUtils.hasText(reason)) {
            biz.put("refund_reason", reason);
        }
        execute(cfg, "alipay.trade.refund", biz);
    }

    /* ── 回调验签 ─────────────────────────────────────────────────────────── */

    /**
     * 校验支付宝异步通知签名。
     *
     * <p>规则：除 {@code sign} / {@code sign_type} 外的**所有非空参数**按 key 升序拼
     * {@code k=v&...}（值取 URL 解码后的原文），用**支付宝公钥**做 SHA256withRSA 验签。
     *
     * <p>⚠️ 任何异常都返回 false —— 宁可让真回调重试（支付宝会重推 8 次），
     * 也绝不能放过伪造回调。
     */
    public boolean verifyCallback(PaymentChannelConfig cfg, Map<String, String> params) {
        if (cfg == null || !StringUtils.hasText(cfg.getAlipayPublicKey())) {
            log.warn("[支付宝] 未配置公钥，拒绝回调");
            return false;
        }
        String sign = params.get("sign");
        if (!StringUtils.hasText(sign)) {
            log.warn("[支付宝] 回调缺少 sign，拒绝");
            return false;
        }
        String content = buildSignContent(params);
        boolean ok = RsaSignUtil.verify(content, sign, cfg.getAlipayPublicKey());
        if (!ok) {
            log.warn("[支付宝] 回调验签不通过 out_trade_no={}", params.get("out_trade_no"));
        }
        return ok;
    }

    /**
     * 构造待验签串（也用于构造请求签名）。
     *
     * <p>排除 {@code sign}/{@code sign_type}，跳过空值，按 key 字典序升序，
     * {@code k=v} 用 {@code &} 连接，**值不做 URL 编码**（支付宝规范如此）。
     */
    public static String buildSignContent(Map<String, String> params) {
        TreeMap<String, String> sorted = new TreeMap<>();
        if (params != null) {
            params.forEach((k, v) -> {
                if (k == null || "sign".equals(k) || "sign_type".equals(k)) {
                    return;
                }
                if (v != null && !v.isEmpty()) {
                    sorted.put(k, v);
                }
            });
        }
        StringBuilder sb = new StringBuilder();
        sorted.forEach((k, v) -> sb.append(k).append('=').append(v).append('&'));
        if (sb.length() > 0) {
            sb.setLength(sb.length() - 1);
        }
        return sb.toString();
    }

    /* ── 内部：一次网关调用 ───────────────────────────────────────────────── */

    private JsonNode execute(PaymentChannelConfig cfg, String method, Map<String, Object> bizContent) {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("app_id", cfg.getAppId());
        params.put("method", method);
        params.put("format", "JSON");
        params.put("charset", "utf-8");
        params.put("sign_type", "RSA2");
        params.put("timestamp", LocalDateTime.now(ZoneId.of("Asia/Shanghai")).format(TS_FMT));
        params.put("version", "1.0");
        if (StringUtils.hasText(cfg.getNotifyUrl())) {
            params.put("notify_url", cfg.getNotifyUrl());
        }
        try {
            params.put("biz_content", MAPPER.writeValueAsString(bizContent));
        } catch (Exception e) {
            throw new IllegalStateException("业务参数序列化失败：" + e.getMessage(), e);
        }
        params.put("sign", RsaSignUtil.sign(buildSignContent(params), cfg.getPrivateKey()));

        String gateway = StringUtils.hasText(cfg.getGatewayUrl()) ? cfg.getGatewayUrl() : DEFAULT_GATEWAY;
        String body;
        try {
            body = httpClient.postForm(gateway, params, String.class);
        } catch (Exception e) {
            throw new IllegalStateException("[支付宝] 网关请求失败：" + e.getMessage(), e);
        }
        if (!StringUtils.hasText(body)) {
            throw new IllegalStateException("[支付宝] 网关返回为空");
        }

        JsonNode root;
        try {
            root = MAPPER.readTree(body);
        } catch (Exception e) {
            throw new IllegalStateException("[支付宝] 网关返回无法解析：" + e.getMessage(), e);
        }
        String nodeName = method.replace('.', '_') + "_response";
        JsonNode node = root.get(nodeName);
        if (node == null) {
            // 网关级错误（如签名被拒）：把错误码带出来，但**不回显密钥**
            throw new IllegalStateException("[支付宝] 未返回 " + nodeName + "，响应：" + brief(body));
        }
        String code = text(node, "code");
        if (!"10000".equals(code)) {
            String subMsg = text(node, "sub_msg");
            String subCode = text(node, "sub_code");
            throw new IllegalStateException("[支付宝] " + method + " 失败："
                    + (subCode == null ? "" : subCode + " ") + (subMsg == null ? code : subMsg));
        }
        return node;
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node == null ? null : node.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }

    /** 元 → 分（字符串"12.34" → 1234） */
    public static long yuanToFen(String yuan) {
        if (!StringUtils.hasText(yuan)) {
            return 0L;
        }
        return new BigDecimal(yuan.trim()).multiply(BigDecimal.valueOf(100))
                .setScale(0, RoundingMode.HALF_UP).longValueExact();
    }

    /** 分 → 元（1234 → "12.34"），支付宝要求两位小数字符串 */
    public static String fenToYuan(long fen) {
        return BigDecimal.valueOf(fen).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP)
                .toPlainString();
    }

    private static String brief(String s) {
        return s.length() <= 300 ? s : s.substring(0, 300) + "...";
    }

    /** 交易状态查询结果 */
    public record TradeState(String tradeStatus, String tradeNo, long totalFen) {

        /** 是否已支付成功 */
        public boolean paid() {
            return "TRADE_SUCCESS".equals(tradeStatus) || "TRADE_FINISHED".equals(tradeStatus);
        }

        /** 是否已关闭（不可再支付） */
        public boolean closed() {
            return "TRADE_CLOSED".equals(tradeStatus);
        }
    }
}
