package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.*;
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
    private String appSecret;

    /** 扩展字段，如 Shopify 的店铺域名 */
    private String extraField;

    /** 状态：ACTIVE / DISABLED */
    private String status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
