package com.fashion.supplychain.warehouse.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_warehouse_location")
public class WarehouseLocation {

    @TableId
    private String id;

    private String locationCode;

    private String locationName;

    private String zoneCode;

    private String zoneName;

    private String aisleCode;

    private String rackCode;

    private String levelCode;

    private String positionCode;

    private String locationType;

    private String warehouseType;

    private Integer capacity;

    private Integer usedCapacity;

    private String status;

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
