package com.fashion.supplychain.warehouse.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("t_stock_change_log")
public class StockChangeLog {

    @TableId
    private String id;

    private String changeNo;

    private String changeType;

    private String stockType;

    private String stockId;

    private String materialCode;

    private String styleNo;

    private String color;

    private String size;

    private String locationCode;

    private BigDecimal beforeQuantity;

    private BigDecimal changeQuantity;

    private BigDecimal afterQuantity;

    private String unit;

    private String bizType;

    private String bizId;

    private String bizNo;

    private String operatorId;

    private String operatorName;

    private String remark;

    private BigDecimal unitPrice;

    private BigDecimal totalAmount;

    private String traceId;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
