package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 电商平台对接凭证配置实体
 * 按租户+平台唯一存储 AppKey/AppSecret 等凭证
 */
@Data
@TableName("t_ec_platform_config")
public class EcPlatformConfig {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID */
    private Long tenantId;

    /** 平台编码：TAOBAO / TMALL / JD / DOUYIN / PINDUODUO / XIAOHONGSHU / WECHAT_SHOP / SHOPIFY */
    private String platformCode;

    /** 店铺名称 */
    private String shopName;

    /** AppKey / Client ID / App ID */
    private String appKey;

    /** AppSecret / Client Secret */
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String appSecret;

    /** 扩展字段，如 Shopify 的店铺域名 */
    private String extraField;

    /** 物流回传API地址（平台发货回调URL），填写后系统出库自动回传物流信息 */
    private String callbackUrl;

    /** 平台店铺ID（授权后由平台返回） */
    private String shopCode;

    /** 接入模式：OAUTH=跳转平台授权 / CREDENTIAL=手工凭证 */
    private String authMode;

    /** 平台访问令牌（OAuth 授权 code 换取） */
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String accessToken;

    /** 刷新令牌 */
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String refreshToken;

    /** 访问令牌过期时间 */
    private LocalDateTime tokenExpiresAt;

    /** 刷新令牌过期时间 */
    private LocalDateTime refreshExpiresAt;

    /** 最近一次授权成功时间 */
    private LocalDateTime authorizedAt;

    /** OAuth 授权防 CSRF state（发起授权时生成，回调时校验） */
    private String authState;

    /** 状态：ACTIVE / DISABLED */
    private String status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
