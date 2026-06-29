package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用户-角色关联实体（支持一人多角色）
 *
 * 替代旧版 User.roleId 单字段，权限计算改为多角色并集。
 * 过渡期 roleId 与 t_user_role 双轨并行，向后兼容。
 */
@Data
@TableName("t_user_role")
public class UserRole {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    private Long userId;

    private Long roleId;

    /** 是否主角色（1=主，0=兼） */
    private Integer isPrimary;

    private LocalDateTime effectiveFrom;

    /** 失效时间（NULL=永久，临时角色必填） */
    private LocalDateTime expireTime;

    /** 授权来源：manual/jit/template */
    private String source;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;
}
