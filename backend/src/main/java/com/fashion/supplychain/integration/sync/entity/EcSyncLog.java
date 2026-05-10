package com.fashion.supplychain.integration.sync.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("t_ec_sync_log")
public class EcSyncLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    private String syncType;
    private String platformCode;
    private String direction;
    private Long styleId;
    private Long skuId;
    private Long mappingId;
    private String requestPayload;
    private String responsePayload;
    private String status;
    private Integer retryCount;
    private Integer maxRetries;
    private LocalDateTime nextRetryAt;
    private String errorCode;
    private String errorMessage;
    private Integer durationMs;
    private String triggeredBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
