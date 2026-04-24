package com.fashion.supplychain.procurement.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_supplier_user")
public class SupplierUser {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String supplierId;

    private Long tenantId;

    private String username;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String passwordHash;

    private String contactPerson;

    private String contactPhone;

    private String contactEmail;

    private String status;

    private LocalDateTime lastLoginTime;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    private Integer deleteFlag;
}
