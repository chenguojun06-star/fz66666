package com.fashion.supplychain.integration.openapi.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * API调用日志
 * 记录每次开放API的调用详情，用于审计、排错、统计
 */
@Data
@TableName("t_tenant_app_log")
public class TenantAppLog {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 关联应用ID */
    private String appId;

    /** 所属租户ID */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 应用类型 */
    private String appType;

    /** 请求方向: INBOUND=客户→我们, OUTBOUND=我们→客户(Webhook) */
    private String direction;

    /** HTTP方法: GET/POST/PUT */
    private String httpMethod;

    /** 请求路径 */
    private String requestPath;

    /** 请求体（截取前2000字） */
    private String requestBody;

    /** 响应状态码 */
    private Integer responseCode;

    /** 响应体（截取前2000字） */
    private String responseBody;

    /** 处理耗时(ms) */
    private Long costMs;

    /** 调用结果: SUCCESS / FAILED / ERROR */
    private String result;

    /** 错误信息 */
    private String errorMessage;

    /** 客户端IP */
    private String clientIp;

    /** 调用时间 */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
