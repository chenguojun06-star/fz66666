package com.fashion.supplychain.warehouse.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_warehouse_area")
public class WarehouseArea {

    @TableId
    private String id;

    private String areaCode;

    private String areaName;

    private String warehouseType;

    private String address;

    private String contactPerson;

    private String contactPhone;

    private String managerId;

    private String managerName;

    private String status;

    private Integer sortOrder;

    private String description;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    private Integer deleteFlag;
}
