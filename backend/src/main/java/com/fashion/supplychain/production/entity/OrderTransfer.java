package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 订单转移实体类
 */
@Data
@TableName("order_transfer")
public class OrderTransfer {

    /**
     * 转移ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 订单ID
     */
    @TableField("order_id")
    private String orderId;

    /**
     * 发起人ID
     */
    @TableField("from_user_id")
    private Long fromUserId;

    /**
     * 发起人姓名(临时字段，非数据库字段)
     */
    @TableField(exist = false)
    private String fromUserName;

    /**
     * 接收人ID
     */
    @TableField("to_user_id")
    private Long toUserId;

    /**
     * 接收人姓名(临时字段，非数据库字段)
     */
    @TableField(exist = false)
    private String toUserName;

    /**
     * 转移状态: pending-待处理, accepted-已接受, rejected-已拒绝
     */
    private String status;

    /**
     * 转移留言
     */
    private String message;

    /**
     * 菲号ID列表（逗号分隔）
     */
    @TableField("bundle_ids")
    private String bundleIds;

    /**
     * 工序编码列表（逗号分隔）
     */
    @TableField("process_codes")
    private String processCodes;

    /**
     * 拒绝原因
     */
    @TableField("reject_reason")
    private String rejectReason;

    /**
     * 创建时间
     */
    @TableField("created_time")
    private LocalDateTime createdTime;

    /**
     * 更新时间
     */
    @TableField("updated_time")
    private LocalDateTime updatedTime;

    /**
     * 处理时间
     */
    @TableField("handled_time")
    private LocalDateTime handledTime;

    /**
     * 订单号(临时字段，非数据库字段)
     */
    @TableField(exist = false)
    private String orderNo;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
