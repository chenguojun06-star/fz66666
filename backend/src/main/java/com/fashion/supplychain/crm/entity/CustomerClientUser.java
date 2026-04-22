package com.fashion.supplychain.crm.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_customer_client_user")
public class CustomerClientUser {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String customerId;

    private String tenantId;

    private String username;

    private String passwordHash;

    private String contactPerson;

    private String contactPhone;

    private String contactEmail;

    private String status;

    private LocalDateTime lastLoginTime;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;
}
