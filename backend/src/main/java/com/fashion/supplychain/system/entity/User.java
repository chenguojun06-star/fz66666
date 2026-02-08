package com.fashion.supplychain.system.entity;

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

    private String status;

    private String approvalStatus; // 审批状态: pending, approved, rejected

    private LocalDateTime approvalTime; // 审批时间

    private String approvalRemark; // 审批备注

    private String phone;

    private String email;

    @TableField(exist = false)
    private String operationRemark;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private LocalDateTime lastLoginTime;

    private String lastLoginIp;
}
