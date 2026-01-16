package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * 加工厂实体类
 */
@Data
@TableName("t_factory")
public class Factory {
    
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;
    
    private String factoryCode;
    
    private String factoryName;
    
    private String contactPerson;
    
    private String contactPhone;
    
    private String address;
    
    private String status;
    
    private LocalDateTime createTime;
    
    private LocalDateTime updateTime;
    
    private Integer deleteFlag;
}
