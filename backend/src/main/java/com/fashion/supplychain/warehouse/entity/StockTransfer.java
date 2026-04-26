package com.fashion.supplychain.warehouse.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("t_stock_transfer")
public class StockTransfer {

    @TableId
    private String id;

    private String transferNo;

    private String transferType;

    private String stockType;

    private String materialCode;

    private String styleNo;

    private String color;

    private String size;

    private Integer quantity;

    private String fromLocationCode;

    private String fromLocationName;

    private String toLocationCode;

    private String toLocationName;

    private String status;

    private String applicantId;

    private String applicantName;

    private String approverId;

    private String approverName;

    private LocalDateTime approveTime;

    private String remark;

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
