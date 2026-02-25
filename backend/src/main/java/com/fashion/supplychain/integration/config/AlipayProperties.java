package com.fashion.supplychain.integration.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 支付宝配置属性
 *
 * ============================================================
 * 接入步骤（拿到API后只需3步）：
 * ============================================================
 * Step 1. 在 application.yml 填入真实密钥：
 *   alipay:
 *     enabled: true
 *     app-id: "202xxxxxxxx"
 *     private-key: "MIIEvgIBADANBgkqhkiG..."   # RSA2私钥（不含头尾）
 *     public-key: "MIIBIjANBgkqhkiG..."          # 支付宝公钥（不含头尾）
 *     notify-url: "https://你的域名/api/webhook/payment/alipay"
 *
 * Step 2. 在 pom.xml 引入 SDK（取消注释）：
 *   <dependency>
 *     <groupId>com.alipay.sdk</groupId>
 *     <artifactId>alipay-sdk-java</artifactId>
 *     <version>4.38.0.ALL</version>
 *   </dependency>
 *
 * Step 3. 在 AlipayAdapter.java 中，按注释替换 mock 实现为真实调用。
 *
 * 密钥获取地址：https://openhome.alipay.com/dev/workspace
 * ============================================================
 */
@Data
@Component
@ConfigurationProperties(prefix = "alipay")
public class AlipayProperties {

    /** 是否启用（false=使用Mock模式） */
    private boolean enabled = false;

    /** 支付宝分配的 AppID */
    private String appId;

    /**
     * 应用私钥（RSA2，PKCS8格式，不含 -----BEGIN/END----- 头尾）
     * 本地生成工具：https://miniu.alipay.com/keytool/create
     */
    private String privateKey;

    /**
     * 支付宝公钥（从开放平台"查看支付宝公钥"复制，不含头尾）
     */
    private String publicKey;

    /** 签名类型，固定：RSA2 */
    private String signType = "RSA2";

    /** 字符集，固定：UTF-8 */
    private String charset = "UTF-8";

    /** 数据格式，固定：JSON */
    private String format = "JSON";

    /** 网关地址（正式) */
    private String gatewayUrl = "https://openapi.alipay.com/gateway.do";

    /** 沙箱网关（测试环境） */
    private String sandboxUrl = "https://openapi-sandbox.dl.alipaydev.com/gateway.do";

    /** 是否使用沙箱环境 */
    private boolean sandbox = false;

    /**
     * 异步回调通知地址（需公网可达）
     * 格式：https://你的域名/api/webhook/payment/alipay
     */
    private String notifyUrl;

    /**
     * 同步跳转地址（支付完成后跳转页面）
     */
    private String returnUrl;

    /** 支付超时时间 */
    private String timeoutExpress = "30m";

    /** 实际生效的网关地址 */
    public String getEffectiveGatewayUrl() {
        return sandbox ? sandboxUrl : gatewayUrl;
    }

    /** 校验配置是否完整 */
    public boolean isConfigured() {
        return enabled
                && appId != null && !appId.isBlank()
                && privateKey != null && !privateKey.isBlank()
                && publicKey != null && !publicKey.isBlank();
    }
}
