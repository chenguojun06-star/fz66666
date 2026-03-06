package com.fashion.supplychain.crm.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 客户订单追踪门户令牌
 * 生成一次性访问链接，客户无需登录即可查看订单进度
 */
@Data
@TableName("t_customer_portal_token")
public class CustomerPortalToken {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 访问令牌（64字符随机十六进制） */
    private String token;

    /** 关联客户 ID */
    private String customerId;

    /** 关联生产订单 ID */
    private String orderId;

    /** 订单号（冗余） */
    private String orderNo;

    /** 令牌过期时间 */
    private LocalDateTime expireTime;

    /** 租户 ID */
    private Long tenantId;

    private String creatorId;
    private String creatorName;
    private LocalDateTime createTime;
}
