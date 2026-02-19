package com.fashion.supplychain.integration.openapi.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 应用详情响应（含脱敏的密钥信息）
 */
@Data
public class TenantAppResponse {
    private String id;
    private Long tenantId;
    private String appName;
    private String appType;
    private String appTypeName;
    private String appKey;
    /** 密钥仅在创建/重置时返回完整值，其他时候返回 "****" */
    private String appSecret;
    private String status;
    private String statusName;
    private String callbackUrl;
    private String callbackSecret;
    private String externalApiUrl;
    private String configJson;
    private Integer dailyQuota;
    private Integer dailyUsed;
    private Long totalCalls;
    private LocalDateTime lastCallTime;
    private LocalDateTime expireTime;
    private LocalDateTime createTime;
    private String remark;

    /** API文档URL（前端拼接） */
    private String apiDocUrl;
    /** 示例代码片段 */
    private String exampleSnippet;
}
