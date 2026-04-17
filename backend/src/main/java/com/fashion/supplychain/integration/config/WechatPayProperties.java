package com.fashion.supplychain.integration.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 微信支付配置属性（V3 API）
 *
 * ============================================================
 * 接入步骤（拿到API后只需3步）：
 * ============================================================
 * Step 1. 在 application.yml 填入真实密钥：
 *   wechat-pay:
 *     enabled: true
 *     app-id: "wx1234567890"
 *     mch-id: "1600000000"
 *     api-v3-key: "32位API V3密钥..."
 *     serial-no: "证书序列号..."
 *     private-key-path: "classpath:cert/apiclient_key.pem"
 *     notify-url: "https://你的域名/api/webhook/payment/wechat"
 *
 * Step 2. 在 pom.xml 引入 SDK（取消注释）：
 *   <dependency>
 *     <groupId>com.github.wechatpay-apiv3</groupId>
 *     <artifactId>wechatpay-java</artifactId>
 *     <version>0.2.14</version>
 *   </dependency>
 *
 * Step 3. 在 WechatPayAdapter.java 按注释替换 mock 实现。
 *
 * 商户密钥获取：https://pay.weixin.qq.com → 账户中心 → API安全
 * API V3 文档：https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml
 * ============================================================
 */
@Data
@Component
@ConfigurationProperties(prefix = "wechat-pay")
public class WechatPayProperties {

    /** 是否启用（false=使用Mock模式） */
    private boolean enabled = false;

    /** 公众号/小程序/APP 的 AppID */
    private String appId;

    /** 微信支付商户号 */
    private String mchId;

    /**
     * API V3 密钥（32位字符串）
     * 商户平台 → 账户中心 → API安全 → 设置APIv3密钥
     */
    private String apiV3Key;

    /**
     * 商户证书序列号
     * 商户平台 → 账户中心 → API安全 → 申请API证书 → 查看证书
     */
    private String serialNo;

    /**
     * 商户私钥文件路径（PEM格式）
     * 例：classpath:cert/apiclient_key.pem
     * 或绝对路径：file:/path/to/apiclient_key.pem
     */
    private String privateKeyPath;

    /**
     * 异步回调通知地址（需公网可达，微信服务器主动推送）
     * 格式：https://你的域名/api/webhook/payment/wechat
     */
    private String notifyUrl;

    /** 支付场景：NATIVE（扫码）、JSAPI（公众号/小程序）、APP */
    private String tradeType = "NATIVE";

    /** 是否已配置完整 */
    public boolean isConfigured() {
        return enabled
                && appId != null && !appId.isBlank()
                && mchId != null && !mchId.isBlank()
                && apiV3Key != null && !apiV3Key.isBlank()
                && serialNo != null && !serialNo.isBlank()
                && privateKeyPath != null && !privateKeyPath.isBlank();
    }
}
