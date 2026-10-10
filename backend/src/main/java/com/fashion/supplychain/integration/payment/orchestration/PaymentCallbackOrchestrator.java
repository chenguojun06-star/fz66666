package com.fashion.supplychain.integration.payment.orchestration;

import com.fashion.supplychain.integration.payment.PaymentGateway;
import com.fashion.supplychain.integration.payment.channel.AlipayGatewayClient;
import com.fashion.supplychain.integration.payment.channel.WechatPayGatewayClient;
import com.fashion.supplychain.integration.payment.config.PaymentChannelConfig;
import com.fashion.supplychain.integration.payment.config.PaymentConfigService;
import com.fashion.supplychain.integration.record.entity.IntegrationCallbackLog;
import com.fashion.supplychain.integration.record.service.IntegrationRecordService;
import com.wechat.pay.java.service.payments.model.Transaction;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 支付回调编排：验签 → 解析 → 确认。控制器只做 HTTP 壳。
 *
 * <p><b>安全底线（历史实现踩过的坑）</b>：
 * 以前的适配器在"密钥未配置"时 {@code verifyCallback} 直接返回 true ——
 * 任何人都能 POST 一个 {@code trade_status=TRADE_SUCCESS} 把订单刷成已支付。
 * 现在：
 * <ol>
 *   <li>未配置渠道 → **直接拒绝**，不解析、不落账；</li>
 *   <li>验签失败 → 拒绝；</li>
 *   <li>验签通过但流水不存在 → 拒绝处理并留错误日志（等运维核对渠道账单）；</li>
 *   <li>重复推送 → 幂等跳过，但仍回 success（否则渠道会一直重推）。</li>
 * </ol>
 *
 * <p><b>租户怎么定位</b>：支付宝回调是明文，用 {@code app_id}（全局唯一）反查配置；
 * 微信回调 body 是加密的（解密需要该商户的 APIv3 密钥），所以回调地址带 tenantId：
 * {@code /api/webhook/payment/wechat/{tenantId}}。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentCallbackOrchestrator {

    private final PaymentConfigService configService;
    private final AlipayGatewayClient alipayClient;
    private final WechatPayGatewayClient wechatClient;
    private final PaymentConfirmOrchestrator confirmOrchestrator;
    private final IntegrationRecordService recordService;

    /* ── 支付宝 ───────────────────────────────────────────────────────────── */

    /**
     * 处理支付宝异步通知。
     *
     * @return 需要原样返回给支付宝的字符串："success" 表示已收到（停止重推），其余会重推
     */
    public String handleAlipay(Map<String, String> params) {
        String raw = params == null ? "" : params.toString();
        IntegrationCallbackLog cbLog = recordService.saveCallbackLog("PAYMENT", "ALIPAY", raw, null);

        String appId = params == null ? null : params.get("app_id");
        PaymentChannelConfig cfg = configService.loadByAlipayAppId(appId);
        if (cfg == null) {
            log.warn("[支付宝回调] 未找到 app_id={} 的收款配置，拒绝处理", appId);
            recordService.updateCallbackResult(cbLog.getId(), false, false, null, "未找到收款配置");
            return "fail";
        }
        if (!alipayClient.verifyCallback(cfg, params)) {
            log.warn("[支付宝回调] 验签失败，拒绝处理 out_trade_no={}", params.get("out_trade_no"));
            recordService.updateCallbackResult(cbLog.getId(), false, false, null, "验签失败");
            return "fail";
        }

        String outTradeNo = params.get("out_trade_no");
        String tradeStatus = params.get("trade_status");
        String tradeNo = params.get("trade_no");
        long paidFen = AlipayGatewayClient.yuanToFen(params.get("total_amount"));

        if ("TRADE_SUCCESS".equals(tradeStatus) || "TRADE_FINISHED".equals(tradeStatus)) {
            boolean done = confirmOrchestrator.confirmPaid(
                    cfg.getTenantId(), "ALIPAY", outTradeNo, tradeNo, paidFen);
            recordService.updateCallbackResult(cbLog.getId(), true, true, outTradeNo, null);
            log.info("[支付宝回调] 已受理 out_trade_no={} 本次落账={}", outTradeNo, done);
        } else if ("TRADE_CLOSED".equals(tradeStatus)) {
            confirmOrchestrator.confirmClosed(cfg.getTenantId(), "ALIPAY", outTradeNo, "支付宝交易关闭");
            recordService.updateCallbackResult(cbLog.getId(), true, true, outTradeNo, null);
        } else {
            // WAIT_BUYER_PAY 等中间态：只记录，不改业务
            recordService.updateCallbackResult(cbLog.getId(), true, false, outTradeNo,
                    "交易状态: " + tradeStatus);
        }
        // 必须返回 success，否则支付宝会重推（最多 8 次）
        return "success";
    }

    /* ── 微信支付 ─────────────────────────────────────────────────────────── */

    /** 处理微信支付 V3 异步通知；返回值原样作为 JSON 响应体 */
    public Map<String, String> handleWechat(Long tenantId, String timestamp, String nonce,
                                            String signature, String serial, String body) {
        IntegrationCallbackLog cbLog = recordService.saveCallbackLog("PAYMENT", "WECHAT_PAY",
                body, headersOf(timestamp, nonce, serial));

        PaymentChannelConfig cfg = configService.load(tenantId, PaymentGateway.PaymentType.WECHAT_PAY);
        if (cfg == null || !cfg.isUsable()) {
            log.warn("[微信回调] 租户 {} 未配置微信支付，拒绝处理", tenantId);
            recordService.updateCallbackResult(cbLog.getId(), false, false, null, "微信支付未配置");
            return fail("微信支付未配置");
        }
        if (!StringUtils.hasText(timestamp) || !StringUtils.hasText(nonce)
                || !StringUtils.hasText(signature) || !StringUtils.hasText(serial)) {
            log.warn("[微信回调] 缺少验签请求头，拒绝处理");
            recordService.updateCallbackResult(cbLog.getId(), false, false, null, "缺少验签请求头");
            return fail("缺少验签请求头");
        }

        Transaction tx;
        try {
            tx = wechatClient.parseCallback(cfg, timestamp, nonce, signature, serial, body);
        } catch (Exception e) {
            // 验签/解密失败一律拒绝：宁可让真回调重推，也不能放过伪造回调
            log.warn("[微信回调] 验签或解密失败，拒绝处理: {}", e.getMessage());
            recordService.updateCallbackResult(cbLog.getId(), false, false, null, "验签或解密失败");
            return fail("验签失败");
        }

        String outTradeNo = tx.getOutTradeNo();
        String tradeState = tx.getTradeState() == null ? null : tx.getTradeState().name();
        String transactionId = tx.getTransactionId();
        long paidFen = tx.getAmount() == null || tx.getAmount().getPayerTotal() == null
                ? 0L : tx.getAmount().getPayerTotal();

        if ("SUCCESS".equals(tradeState)) {
            boolean done = confirmOrchestrator.confirmPaid(
                    tenantId, "WECHAT_PAY", outTradeNo, transactionId, paidFen);
            recordService.updateCallbackResult(cbLog.getId(), true, true, outTradeNo, null);
            log.info("[微信回调] 已受理 out_trade_no={} 本次落账={}", outTradeNo, done);
        } else if ("CLOSED".equals(tradeState) || "REVOKED".equals(tradeState)) {
            confirmOrchestrator.confirmClosed(tenantId, "WECHAT_PAY", outTradeNo, "微信交易关闭");
            recordService.updateCallbackResult(cbLog.getId(), true, true, outTradeNo, null);
        } else {
            recordService.updateCallbackResult(cbLog.getId(), true, false, outTradeNo,
                    "交易状态: " + tradeState);
        }
        Map<String, String> ok = new LinkedHashMap<>();
        ok.put("code", "SUCCESS");
        ok.put("message", "成功");
        return ok;
    }

    private static Map<String, String> fail(String message) {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("code", "FAIL");
        m.put("message", message);
        return m;
    }

    /** 请求头落库（便于排查验签问题），只留与验签相关的四个 */
    private static String headersOf(String timestamp, String nonce, String serial) {
        return "{\"Wechatpay-Timestamp\":\"" + nvl(timestamp) + "\",\"Wechatpay-Nonce\":\""
                + nvl(nonce) + "\",\"Wechatpay-Serial\":\"" + nvl(serial) + "\"}";
    }

    private static String nvl(String s) {
        return s == null ? "" : s;
    }
}
