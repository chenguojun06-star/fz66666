package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 用户权限微调（覆盖）
 * 在角色权限基础上，为特定用户额外授予或撤销权限
 */
@Data
@TableName("t_user_permission_override")
public class UserPermissionOverride {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 用户ID */
    private Long userId;

    /** 权限ID */
    private Long permissionId;

    /** 覆盖类型: GRANT=额外授予, REVOKE=撤销 */
    private String overrideType;

    /** 所属租户ID */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    private LocalDateTime createTime;
}
