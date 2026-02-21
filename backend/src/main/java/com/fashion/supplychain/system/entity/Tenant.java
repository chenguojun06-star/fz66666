package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 租户实体类
 * 多租户SaaS架构核心：每个租户拥有独立的数据空间
 *
 * 层级关系：
 * - 超级管理员（系统拥有者）→ 管理所有租户
 * - 租户主账号（ownerUserId）→ 管理本租户的子账号和数据
 * - 子账号 → 只能操作本租户数据
 */
@Data
@TableName("t_tenant")
public class Tenant {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户名称（公司/工厂名） */
    private String tenantName;

    /** 租户编码（唯一标识，如 T0001） */
    private String tenantCode;

    /** 租户主账号用户ID */
    private Long ownerUserId;

    /** 租户主账号用户名（非数据库字段，查询时补充填充） */
    @TableField(exist = false)
    private String ownerUsername;

    /** 联系人 */
    private String contactName;

    /** 联系电话 */
    private String contactPhone;

    /** 状态: active=正常, disabled=禁用, expired=过期, pending_review=申请待审核, rejected=申请已拒绝 */
    private String status;

    /** 付费状态: TRIAL=免费试用, PAID=已付费 */
    private String paidStatus = "TRIAL";

    /** 套餐类型: TRIAL/BASIC/PRO/ENTERPRISE */
    private String planType = "TRIAL";

    /** 月费(元) */
    private BigDecimal monthlyFee = BigDecimal.ZERO;

    /** 存储配额(MB)，默认1GB */
    private Long storageQuotaMb = 1024L;

    /** 已用存储(MB) */
    private Long storageUsedMb = 0L;

    /** 计费周期: MONTHLY=月付, YEARLY=年付 */
    private String billingCycle = "MONTHLY";

    /** 申请账号名（仅申请入驻流程使用，审批通过后创建账号） */
    private String applyUsername;

    /** 申请密码BCrypt（仅申请入驻流程使用，审批通过后创建账号，之后清空） */
    @TableField("apply_password")
    private String applyPassword;

    /** 最大用户数限制（0=不限制） */
    private Integer maxUsers;

    /** 过期时间（null=永不过期） */
    private LocalDateTime expireTime;

    /** 备注 */
    private String remark;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
