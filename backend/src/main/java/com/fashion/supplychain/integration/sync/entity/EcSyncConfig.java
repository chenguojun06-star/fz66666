package com.fashion.supplychain.integration.sync.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_ec_sync_config")
public class EcSyncConfig {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    private String platformCode;
    private String configType;
    private Boolean enabled;
    private String appId;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String appSecret;

    private String privateKey;
    private String publicKey;
    private String callbackUrl;
    private String extraConfig;
    private String syncRules;
    private Integer rateLimitPerMin;
    private LocalDateTime lastSyncAt;
    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
