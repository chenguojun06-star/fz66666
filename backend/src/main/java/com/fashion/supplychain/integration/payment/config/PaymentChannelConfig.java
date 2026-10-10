package com.fashion.supplychain.integration.payment.config;

import com.fashion.supplychain.integration.payment.PaymentGateway;
import lombok.Builder;
import lombok.Data;

/**
 * 已解密的收款渠道参数（内存态，用完即弃）。
 *
 * <p>与 {@code PaymentConfig} 的区别：那个是**落库实体**（密钥是密文），
 * 这个是**解密后的运行态**（含明文密钥），只在发起支付/验签的瞬间存在，
 * 绝不写日志、绝不返回前端。
 */
@Data
@Builder
public class PaymentChannelConfig {

    private Long tenantId;

    private PaymentGateway.PaymentType channel;

    /** 支付宝 AppID / 微信 AppID */
    private String appId;

    /** 微信商户号 */
    private String mchId;

    /** 应用私钥（PEM 内容，不含头尾也可） */
    private String privateKey;

    /** 支付宝公钥（验签用） */
    private String alipayPublicKey;

    /** 微信 APIv3 密钥 */
    private String apiV3Key;

    /** 微信商户证书序列号 */
    private String serialNo;

    private String notifyUrl;

    private String gatewayUrl;

    private boolean sandbox;

    /**
     * 参数是否完整（决定能不能真的发起支付）。
     *
     * <p>不完整就**明确拒绝**，绝不降级成"模拟成功" —— 假装收到钱比收不到钱更糟。
     */
    public boolean isUsable() {
        if (appId == null || appId.isBlank() || privateKey == null || privateKey.isBlank()) {
            return false;
        }
        if (channel == PaymentGateway.PaymentType.ALIPAY) {
            return alipayPublicKey != null && !alipayPublicKey.isBlank();
        }
        if (channel == PaymentGateway.PaymentType.WECHAT_PAY) {
            return mchId != null && !mchId.isBlank()
                    && apiV3Key != null && !apiV3Key.isBlank()
                    && serialNo != null && !serialNo.isBlank();
        }
        return true;
    }

    /** 缺什么，说清楚（给商家看的提示，不含密钥内容） */
    public String missingHint() {
        StringBuilder sb = new StringBuilder();
        if (appId == null || appId.isBlank()) {
            sb.append(channel == PaymentGateway.PaymentType.ALIPAY ? "AppID " : "AppID ");
        }
        if (privateKey == null || privateKey.isBlank()) {
            sb.append(channel == PaymentGateway.PaymentType.ALIPAY ? "应用私钥 " : "商户私钥 ");
        }
        if (channel == PaymentGateway.PaymentType.ALIPAY
                && (alipayPublicKey == null || alipayPublicKey.isBlank())) {
            sb.append("支付宝公钥 ");
        }
        if (channel == PaymentGateway.PaymentType.WECHAT_PAY) {
            if (mchId == null || mchId.isBlank()) {
                sb.append("商户号 ");
            }
            if (apiV3Key == null || apiV3Key.isBlank()) {
                sb.append("APIv3密钥 ");
            }
            if (serialNo == null || serialNo.isBlank()) {
                sb.append("证书序列号 ");
            }
        }
        String s = sb.toString().trim();
        return s.isEmpty() ? "" : s;
    }
}
