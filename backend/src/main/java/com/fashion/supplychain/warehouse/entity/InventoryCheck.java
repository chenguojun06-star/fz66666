package com.fashion.supplychain.warehouse.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("t_inventory_check")
public class InventoryCheck {

    @TableId
    private String id;

    private String checkNo;

    private String checkType;

    private String status;

    private LocalDate checkDate;

    private String warehouseLocation;

    private Integer totalItems;

    private Integer diffItems;

    private Integer totalBookQty;

    private Integer totalActualQty;

    private Integer totalDiffQty;

    private BigDecimal totalDiffAmount;

    private String remark;

    private String confirmedBy;

    private String confirmedName;

    private LocalDateTime confirmedTime;

    private String createdById;

    private String createdByName;

    private Long tenantId;

    private Integer deleteFlag;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    @TableField(exist = false)
    private java.util.List<InventoryCheckItem> items;
}
