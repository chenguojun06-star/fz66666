package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 租户权限天花板
 * 超级管理员为每个租户设置可用权限范围
 * 租户内所有用户的权限不能超过此天花板
 */
@Data
@TableName("t_tenant_permission_ceiling")
public class TenantPermissionCeiling {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 权限ID */
    private Long permissionId;

    /** 状态: GRANTED=已授权, BLOCKED=已屏蔽 */
    private String status;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
