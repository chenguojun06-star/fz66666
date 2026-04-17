package com.fashion.supplychain.integration.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 申通快递配置属性
 *
 * ============================================================
 * 接入步骤（拿到API后只需3步）：
 * ============================================================
 * Step 1. 在 application.yml 填入真实密钥：
 *   sto-express:
 *     enabled: true
 *     app-key: "你的AppKey"
 *     app-secret: "你的AppSecret"
 *     partner-id: "合作伙伴ID"
 *     notify-url: "https://你的域名/api/webhook/logistics/sto"
 *
 * Step 2. 在 STOAdapter.java 按注释替换 mock 实现（约 15 行）。
 *
 * 开放平台：https://open.sto.cn
 * API 文档：https://open.sto.cn/api-doc
 * ============================================================
 */
@Data
@Component
@ConfigurationProperties(prefix = "sto-express")
public class STOProperties {

    /** 是否启用（false=使用Mock模式） */
    private boolean enabled = false;

    /** 开放平台分配的 AppKey */
    private String appKey;

    /** 开放平台分配的 AppSecret */
    private String appSecret;

    /** 合作伙伴ID（部分接口需要） */
    private String partnerId;

    /** 正式环境接口地址 */
    private String apiUrl = "https://ecapi.sto.cn/api/";

    /** 沙箱地址 */
    private String sandboxUrl = "https://ecapi-sandbox.sto.cn/api/";

    /** 是否使用沙箱 */
    private boolean sandbox = false;

    /**
     * 物流状态推送地址（申通推送到此地址）
     * 格式：https://你的域名/api/webhook/logistics/sto
     */
    private String notifyUrl;

    /** HTTP 请求超时（毫秒） */
    private int connectTimeout = 5000;
    private int readTimeout = 10000;

    /** 实际生效的API地址 */
    public String getEffectiveApiUrl() {
        return sandbox ? sandboxUrl : apiUrl;
    }

    /** 是否已配置完整 */
    public boolean isConfigured() {
        return enabled
                && appKey != null && !appKey.isBlank()
                && appSecret != null && !appSecret.isBlank();
    }
}
