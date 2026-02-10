package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

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

    /** 联系人 */
    private String contactName;

    /** 联系电话 */
    private String contactPhone;

    /** 状态: active=正常, disabled=禁用, expired=过期 */
    private String status;

    /** 最大用户数限制（0=不限制） */
    private Integer maxUsers;

    /** 过期时间（null=永不过期） */
    private LocalDateTime expireTime;

    /** 备注 */
    private String remark;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
