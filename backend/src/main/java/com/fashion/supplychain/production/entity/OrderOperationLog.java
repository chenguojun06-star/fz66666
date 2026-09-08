package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 大货订单操作日志（与样衣 t_style_operation_log 同构）
 * 记录订单侧关键操作：谁 / 何时 / 做了什么，供"操作记录"面板统一查看。
 */
@Data
@TableName("t_order_operation_log")
public class OrderOperationLog {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long orderId;

    private String orderNo;

    private String action;

    private String operator;

    private String remark;

    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}