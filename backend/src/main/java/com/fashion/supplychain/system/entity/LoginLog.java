package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 登录日志实体类
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
}
