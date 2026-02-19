package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 权限实体类
 */
@Data
@TableName("t_permission")
public class Permission {
    
    @TableId(type = IdType.AUTO)
    private Long id;
    
    private String permissionName;
    
    private String permissionCode;
    
    private Long parentId;
    
    private String parentName;
    
    private String permissionType;
    
    private String path;
    
    private String component;
    
    private String icon;
    
    private Integer sort;
    
    private String status;
    
    private LocalDateTime createTime;
    
    private LocalDateTime updateTime;
}
