package com.fashion.supplychain.integration.openapi.dto;

import lombok.Data;

/**
 * 创建/更新应用请求
 */
@Data
public class TenantAppRequest {
    /** 应用名称 */
    private String appName;
    /** 应用类型: ORDER_SYNC / QUALITY_FEEDBACK / LOGISTICS_SYNC / PAYMENT_SYNC */
    private String appType;
    /** 回调URL */
    private String callbackUrl;
    /** 客户外部API地址 */
    private String externalApiUrl;
    /** 日调用上限 */
    private Integer dailyQuota;
    /** 对接配置JSON */
    private String configJson;
    /** 过期时间（ISO格式） */
    private String expireTime;
    /** 备注 */
    private String remark;
}
