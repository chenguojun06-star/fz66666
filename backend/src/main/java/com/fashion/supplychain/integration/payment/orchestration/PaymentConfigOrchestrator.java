package com.fashion.supplychain.integration.payment.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.integration.payment.PaymentGateway;
import com.fashion.supplychain.integration.payment.PaymentManager;
import com.fashion.supplychain.integration.payment.config.PaymentConfigService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 收款设置编排：给商家配置"自己的"微信/支付宝商户参数。
 *
 * <p><b>合规前提</b>：微信/支付宝商户号是企业资质，资金结算到该企业账户。
 * 平台用一个商户号代收所有商家的钱再转付，属于**二清**（无《支付业务许可证》
 * 属非法经营）。所以这里只做"让每个商家填自己的商户号"，
 * 平台不提供、也不托管任何收款账号。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentConfigOrchestrator {

    private final PaymentConfigService configService;
    private final PaymentManager paymentManager;

    /** 两种渠道的配置状态（密钥只报"是否已设置"，绝不回传内容） */
    public Map<String, Object> status() {
        Long tenantId = requireTenant();
        Map<String, Object> out = new LinkedHashMap<>();
        List<Map<String, Object>> channels = new ArrayList<>();
        for (PaymentGateway.PaymentType t : PaymentGateway.PaymentType.values()) {
            Map<String, Object> row = configService.describe(tenantId, t);
            row.put("notifyUrlSuggestion", suggestNotifyUrl(t, tenantId));
            channels.add(row);
        }
        out.put("channels", channels);
        out.put("anyReady", configService.anyChannelReady(tenantId));
        out.put("tenantId", tenantId);
        return out;
    }

    /** 保存某渠道配置（密钥传空 = 保持原值，传 "-" = 清空） */
    public void save(String channelCode, Map<String, Object> body) {
        Long tenantId = requireTenant();
        PaymentGateway.PaymentType type = parseChannel(channelCode);
        configService.save(tenantId, type, body);
    }

    /**
     * 连通性验证：确认密钥能对上（不是"能收款"，而是"能签出合法请求"）。
     *
     * <p>做法是拿一个必然不存在的单号去查询：
     * <ul>
     *   <li>密钥/证书不对 → 渠道直接报签名错误，这里会失败；</li>
     *   <li>密钥正确 → 渠道报"订单不存在"，说明鉴权通过，验证成功。</li>
     * </ul>
     * 这样不需要真的下一单、也不会产生任何资金动作。
     */
    public Map<String, Object> verify(String channelCode) {
        Long tenantId = requireTenant();
        PaymentGateway.PaymentType type = parseChannel(channelCode);
        String probeNo = "VERIFY" + System.currentTimeMillis();
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            paymentManager.queryPayment(tenantId, probeNo, null, type);
            configService.markVerified(tenantId, type);
            out.put("ok", true);
            out.put("message", "鉴权通过，配置可用");
        } catch (RuntimeException e) {
            out.put("ok", false);
            out.put("message", e.getMessage());
        }
        return out;
    }

    private String suggestNotifyUrl(PaymentGateway.PaymentType type, Long tenantId) {
        // 回调地址必须公网可达且已备案；这里给出约定路径，具体域名由商家按自己的部署填
        return type == PaymentGateway.PaymentType.WECHAT_PAY
                ? "/api/webhook/payment/wechat/" + tenantId
                : "/api/webhook/payment/alipay";
    }

    private PaymentGateway.PaymentType parseChannel(String code) {
        PaymentGateway.PaymentType type = PaymentGateway.PaymentType.parse(code);
        if (type == null) {
            throw new IllegalArgumentException("不支持的收款渠道：" + code);
        }
        return type;
    }

    private Long requireTenant() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalArgumentException("请先登录");
        }
        return tenantId;
    }

    /** 供其它模块判断"这家商户能不能在线收款" */
    public boolean anyChannelReady() {
        Long tenantId = UserContext.tenantId();
        return tenantId != null && configService.anyChannelReady(tenantId);
    }

    /** 渠道可用性（收银台据此决定按钮是否可点） */
    public Map<String, Boolean> channelReadiness() {
        Long tenantId = UserContext.tenantId();
        Map<String, Boolean> out = new LinkedHashMap<>();
        for (PaymentGateway.PaymentType t : PaymentGateway.PaymentType.values()) {
            out.put(t.name(), tenantId != null && paymentManager.isChannelReady(tenantId, t));
        }
        return out;
    }

    /** 兜底：确认回调地址不为空（配了商户号却没配回调地址会导致永远收不到结果） */
    public void assertNotifyUrlConfigured(Long tenantId, PaymentGateway.PaymentType type) {
        Map<String, Object> st = configService.describe(tenantId, type);
        Object url = st.get("notifyUrl");
        if (url == null || !StringUtils.hasText(String.valueOf(url))) {
            throw new IllegalArgumentException("请先配置"
                    + type.getDisplayName() + "的异步通知地址，否则收不到支付结果");
        }
    }
}
