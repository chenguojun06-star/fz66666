package com.fashion.supplychain.integration.record.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 集成渠道配置实体
 * 支持前端界面配置渠道密钥（支付宝/微信支付/顺丰/申通）
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("t_integration_channel_config")
public class IntegrationChannelConfig {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID */
    private Long tenantId;

    /** 渠道编码: ALIPAY / WECHAT_PAY / SF / STO */
    private String channelCode;

    /** 是否启用 */
    private Boolean enabled;

    /** AppID / AppKey */
    private String appId;

    /** AppSecret / MchId */
    private String appSecret;

    /** 私钥 / API密钥 */
    private String privateKey;

    /** 公钥 */
    private String publicKey;

    /** 回调通知地址 */
    private String notifyUrl;

    /** 扩展配置（JSON字符串） */
    private String extraConfig;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    @TableLogic
    private Integer deleteFlag;
}
