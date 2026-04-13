package com.fashion.supplychain.warehouse.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("t_inventory_check_item")
public class InventoryCheckItem {

    @TableId
    private String id;

    private String checkId;

    private String stockId;

    private String materialCode;

    private String materialName;

    private String skuCode;

    private String color;

    private String size;

    private String specifications;

    private String unit;

    private BigDecimal unitPrice;

    private Integer bookQuantity;

    private Integer actualQuantity;

    private Integer diffQuantity;

    private BigDecimal diffAmount;

    private String diffType;

    private String checkStatus;

    private String remark;

    private Long tenantId;

    private Integer deleteFlag;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
