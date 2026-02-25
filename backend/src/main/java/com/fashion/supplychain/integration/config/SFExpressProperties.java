package com.fashion.supplychain.integration.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 顺丰速运配置属性（BSP标准接口）
 *
 * ============================================================
 * 接入步骤（拿到API后只需3步）：
 * ============================================================
 * Step 1. 在 application.yml 填入真实密钥：
 *   sf-express:
 *     enabled: true
 *     app-key: "你的AppKey"
 *     app-secret: "你的AppSecret"   # 每月轮换
 *     monthly-token: "每月更新的Token"
 *     customer-code: "顺丰客户编码"
 *     notify-url: "https://你的域名/api/webhook/logistics/sf"
 *
 * Step 2. 在 SFExpressAdapter.java 按注释替换 mock 实现（约 20 行）。
 *
 * 开放平台：https://open.sf-express.com
 * 技术文档：https://open.sf-express.com/developSupport/734349
 * 沙箱测试：https://sfapi-sbox.sf-express.com/std/service
 * ============================================================
 */
@Data
@Component
@ConfigurationProperties(prefix = "sf-express")
public class SFExpressProperties {

    /** 是否启用（false=使用Mock模式） */
    private boolean enabled = false;

    /** 开放平台分配的 AppKey */
    private String appKey;

    /**
     * AppSecret（每月需要更新）
     * 在开放平台后台查看，每30天自动轮换
     */
    private String appSecret;

    /**
     * 月结客户编码（选填，对应客户月结账单）
     */
    private String customerCode;

    /**
     * 正式环境接口地址
     */
    private String apiUrl = "https://sfapi.sf-express.com/std/service";

    /**
     * 沙箱环境接口地址（开发测试用）
     */
    private String sandboxUrl = "https://sfapi-sbox.sf-express.com/std/service";

    /** 是否使用沙箱 */
    private boolean sandbox = false;

    /**
     * 路由事件推送地址（需公网可达）
     * 顺丰侧主动推送物流状态变更
     */
    private String notifyUrl;

    /**
     * 快件默认来源（1=收寄，2=客户送货，3=丰巢预约）
     */
    private String expressCategory = "1";

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
