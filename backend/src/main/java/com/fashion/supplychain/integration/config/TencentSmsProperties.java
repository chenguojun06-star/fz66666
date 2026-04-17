package com.fashion.supplychain.integration.config;

import lombok.RequiredArgsConstructor;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "app.auth.sms-login.tencent")
@RequiredArgsConstructor
public class TencentSmsProperties {

    private boolean enabled = false;

    private final String secretId;

    private final String secretKey;

    private final String sdkAppId;

    private final String signName;

    private final String templateId;

    private String region = "ap-guangzhou";

    private String endpoint = "sms.tencentcloudapi.com";

    private int connectTimeoutSeconds = 10;

    private int readTimeoutSeconds = 10;

    private int writeTimeoutSeconds = 10;

    public boolean isConfigured() {
        return enabled
                && hasText(secretId)
                && hasText(secretKey)
                && hasText(sdkAppId)
                && hasText(signName)
                && hasText(templateId)
                && hasText(region)
                && hasText(endpoint);
    }

    private static boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
