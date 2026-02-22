package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import java.time.LocalDateTime;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

/**
 * 用户实体类
 */
@Data
@TableName("t_user")
public class User {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String username;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String password;

    private String name;

    private Long roleId;

    private String roleName;

    private String permissionRange;

    /** 所属租户ID（多租户隔离核心字段） */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 是否为租户主账号 */
    private Boolean isTenantOwner;

    /** 是否为平台超级管理员（跨租户全局权限） */
    private Boolean isSuperAdmin;

    private String status;

    private String approvalStatus; // 审批状态: pending, approved, rejected

    private LocalDateTime approvalTime; // 审批时间

    private String approvalRemark; // 审批备注

    /** 注册状态: PENDING=待审批, ACTIVE=已通过, REJECTED=已拒绝 */
    private String registrationStatus;

    /** 注册时填写的租户码 */
    private String registrationTenantCode;

    /** 拒绝原因 */
    private String rejectReason;

    private String phone;

    private String email;

    @TableField(exist = false)
    private String operationRemark;

    /** 租户名称（非数据库字段，用于显示） */
    @TableField(exist = false)
    private String tenantName;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private LocalDateTime lastLoginTime;

    private String lastLoginIp;

    /** 微信小程序 openid（用于一键登录，首次手动绑定后自动登录） */
    private String openid;

    /** 用户头像URL（COS存储路径或本地路径） */
    private String avatarUrl;
}
