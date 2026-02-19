package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 租户应用订阅实体
 */
@Data
@TableName("t_tenant_subscription")
public class TenantSubscription {

    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 订阅编号：SUB20260210001
     */
    private String subscriptionNo;

    /**
     * 租户ID
     */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /**
     * 租户名称
     */
    private String tenantName;

    /**
     * 应用ID
     */
    private Long appId;

    /**
     * 应用编码
     */
    private String appCode;

    /**
     * 应用名称
     */
    private String appName;

    /**
     * 订阅类型：TRIAL/MONTHLY/YEARLY/PERPETUAL
     */
    private String subscriptionType;

    /**
     * 订阅价格
     */
    private BigDecimal price;

    /**
     * 购买用户数
     */
    private Integer userCount;

    /**
     * 生效时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;

    /**
     * 到期时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime endTime;

    /**
     * 状态：TRIAL/ACTIVE/EXPIRED/CANCELED
     */
    private String status;

    /**
     * 是否自动续费
     */
    private Boolean autoRenew;

    /**
     * 关联订单ID
     */
    private Long orderId;

    /**
     * 备注
     */
    private String remark;

    /**
     * 创建人
     */
    private String createdBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;

    @TableLogic
    private Integer deleteFlag;
}
