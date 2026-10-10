package com.fashion.supplychain.integration.payment.callback;

import com.fashion.supplychain.integration.payment.orchestration.PaymentCallbackOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 支付回调接收入口（第三方服务器直接调用，免登录，见 SecurityConstants 的
 * {@code /api/webhook/**} 白名单）。
 *
 * <p>本控制器**只做 HTTP 壳**：把参数交给
 * {@link PaymentCallbackOrchestrator}，由它完成验签、幂等确认与业务落账。
 * 这样控制器不依赖任何 Service（架构规则6）。
 *
 * <p><b>回调地址怎么配</b>：
 * <ul>
 *   <li>支付宝：{@code https://你的域名/api/webhook/payment/alipay}</li>
 *   <li>微信支付：{@code https://你的域名/api/webhook/payment/wechat/{tenantId}}
 *       —— 带租户 ID 是因为微信回调 body 是加密的，解密需要该商户的 APIv3 密钥，
 *       没法先解析出单号再反查租户。</li>
 * </ul>
 * 地址会随「收款设置」页面自动带出，商家复制到商户平台即可。
 */
@Slf4j
@RestController
@RequestMapping("/api/webhook/payment")
@RequiredArgsConstructor
public class PaymentCallbackController {

    private final PaymentCallbackOrchestrator callbackOrchestrator;

    /**
     * 支付宝异步通知。
     *
     * <p>支付宝会多次推送，处理成功必须返回字符串 {@code success}，否则会重推（最多 8 次）。
     */
    @PostMapping("/alipay")
    public String alipayCallback(@RequestParam Map<String, String> params) {
        try {
            return callbackOrchestrator.handleAlipay(params);
        } catch (Exception e) {
            // 不把异常抛给支付宝（会当成 5xx），返回 fail 让它按策略重推
            log.error("[支付宝回调] 处理异常", e);
            return "fail";
        }
    }

    /**
     * 微信支付异步通知（V3）。
     *
     * <p>成功返回 {@code {"code":"SUCCESS"}}，失败返回 {@code {"code":"FAIL"}}。
     */
    @PostMapping("/wechat/{tenantId}")
    public Map<String, String> wechatCallback(
            @PathVariable Long tenantId,
            @RequestHeader(value = "Wechatpay-Timestamp", required = false) String timestamp,
            @RequestHeader(value = "Wechatpay-Nonce", required = false) String nonce,
            @RequestHeader(value = "Wechatpay-Signature", required = false) String signature,
            @RequestHeader(value = "Wechatpay-Serial", required = false) String serial,
            @RequestBody String body) {
        try {
            return callbackOrchestrator.handleWechat(tenantId, timestamp, nonce, signature, serial, body);
        } catch (Exception e) {
            log.error("[微信回调] 处理异常 tenant={}", tenantId, e);
            return Map.of("code", "FAIL", "message", "处理异常");
        }
    }
}
