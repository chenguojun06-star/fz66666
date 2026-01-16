package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import java.time.LocalDateTime;
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
    
    private String password;
    
    private String name;
    
    private Long roleId;
    
    private String roleName;
    
    private String permissionRange;
    
    private String status;
    
    private String phone;
    
    private String email;
    
    private LocalDateTime createTime;
    
    private LocalDateTime updateTime;
    
    private LocalDateTime lastLoginTime;
    
    private String lastLoginIp;
}
