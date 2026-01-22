package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 角色实体类
 */
@Data
@TableName("t_role")
public class Role {
    
    @TableId(type = IdType.AUTO)
    private Long id;
    
    private String roleName;
    
    private String roleCode;
    
    private String description;
    
    private String status;
    
    private String dataScope; // 数据权限范围: all-全部数据, self-仅本人数据

    @TableField(exist = false)
    private String operationRemark;
    
    private LocalDateTime createTime;
    
    private LocalDateTime updateTime;
}
