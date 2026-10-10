package com.fashion.supplychain.integration.payment.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 每租户收款配置（{@code t_payment_config}）。
 *
 * <p><b>为什么按租户存</b>：微信/支付宝商户号是企业资质，资金结算到该企业账户。
 * 平台用一个商户号收所有商家的钱再转给商家 = 二清（无牌照非法经营）。
 * 所以商家必须用自己的商户号收款，平台只做技术通道。
 *
 * <p><b>敏感字段</b>：{@code privateKeyCipher} / {@code publicKeyCipher} /
 * {@code apiV3KeyCipher} 存的是 AES-GCM 密文（见 {@code PaymentConfigService}），
 * 明文绝不落库、绝不回传前端、绝不进日志。
 */
@Data
@TableName("t_payment_config")
public class PaymentConfig {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** ALIPAY / WECHAT_PAY */
    private String channel;

    /** 启用且参数完整才允许发起支付 */
    private Integer enabled;

    /** 支付宝 AppID / 微信 AppID */
    private String appId;

    /** 微信支付商户号 */
    private String mchId;

    /** 应用私钥（RSA2 / 商户私钥），AES-GCM 密文 */
    private String privateKeyCipher;

    /** 支付宝公钥，AES-GCM 密文（仅支付宝用） */
    private String publicKeyCipher;

    /** 微信 APIv3 密钥，AES-GCM 密文（仅微信用） */
    private String apiV3KeyCipher;

    /** 微信商户证书序列号 */
    private String serialNo;

    private String notifyUrl;

    private String gatewayUrl;

    private Integer sandbox;

    /** 最近一次连通性验证通过时间 */
    private LocalDateTime verifiedTime;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
