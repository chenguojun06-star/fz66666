package com.fashion.supplychain.integration.sync.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class EcSyncContext {
    private Long tenantId;
    private String platformCode;
    private String appId;
    private String appSecret;
    private String accessToken;
    private String shopDomain;
    private String callbackUrl;
    private String extraConfig;
}
