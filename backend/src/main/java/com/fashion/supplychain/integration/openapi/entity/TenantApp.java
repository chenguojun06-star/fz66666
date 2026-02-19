package com.fashion.supplychain.integration.openapi.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 客户应用（独立对接模块）
 * 每个租户可以购买/启用多个应用模块，每个模块有独立的 appKey + appSecret
 *
 * 应用类型：
 * - ORDER_SYNC: 下单对接（客户ERP→我们的生产订单）
 * - QUALITY_FEEDBACK: 质检反馈（入库质检结果→客户系统）
 * - LOGISTICS_SYNC: 物流对接（出库/物流→客户系统）
 * - PAYMENT_SYNC: 付款对接（对账结算↔客户支付系统）
 */
@Data
@TableName("t_tenant_app")
public class TenantApp {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 所属租户ID */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 应用名称（由客户自定义，如"XXX品牌下单通道"） */
    private String appName;

    /**
     * 应用类型
     * ORDER_SYNC / QUALITY_FEEDBACK / LOGISTICS_SYNC / PAYMENT_SYNC
     */
    private String appType;

    /** 应用密钥ID（对外暴露，用于鉴权请求头） */
    private String appKey;

    /** 应用密钥（加密存储，首次生成后只显示一次） */
    private String appSecret;

    /** 状态: active=启用, disabled=停用, expired=过期 */
    private String status;

    // ========== 对接配置 ==========

    /** 客户回调/Webhook URL（用于推送数据给客户） */
    private String callbackUrl;

    /** 回调签名密钥（我们推送时用此密钥签名，客户验签） */
    private String callbackSecret;

    /** 客户系统的API地址（用于主动调客户接口） */
    private String externalApiUrl;

    /** 对接配置JSON（每种应用类型有不同的配置项） */
    @TableField(value = "config_json")
    private String configJson;

    // ========== 用量统计 ==========

    /** 日调用上限（0=不限制） */
    private Integer dailyQuota;

    /** 今日已调用次数 */
    private Integer dailyUsed;

    /** 上次重置日期 */
    private LocalDateTime lastQuotaResetTime;

    /** 总调用次数 */
    private Long totalCalls;

    // ========== 审计字段 ==========

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    private String createdBy;

    /** 过期时间（null=永不过期） */
    private LocalDateTime expireTime;

    /** 上次调用时间 */
    private LocalDateTime lastCallTime;

    /** 备注 */
    private String remark;

    @TableLogic
    private Integer deleteFlag;
}
