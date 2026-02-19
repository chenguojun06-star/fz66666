package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 登录日志/操作日志实体类（合并后）
 */
@Data
@TableName("t_login_log")
public class LoginLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String username;

    @TableField(exist = false)
    private String name;

    @TableField("login_ip")
    private String ip;

    private LocalDateTime loginTime;

    @TableField("login_result")
    private String loginStatus;

    @TableField("error_message")
    private String message;

    @TableField(exist = false)
    private String userAgent;

    // ==================== 操作日志相关字段 ====================

    /**
     * 日志类型：LOGIN-登录日志，OPERATION-操作日志
     */
    private String logType;

    /**
     * 业务类型（仅操作日志）
     */
    private String bizType;

    /**
     * 业务ID（仅操作日志）
     */
    private String bizId;

    /**
     * 操作动作（仅操作日志）
     */
    private String action;

    /**
     * 备注
     */
    private String remark;

    /**
     * 租户ID（多租户隔离）
     */
    @TableField("tenant_id")
    private Long tenantId;
}
