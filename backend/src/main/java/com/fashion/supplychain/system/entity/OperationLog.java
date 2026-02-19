package com.fashion.supplychain.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 操作日志实体
 */
@Data
@TableName("t_operation_log")
public class OperationLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 模块名称
     */
    private String module;

    /**
     * 操作类型
     */
    private String operation;

    /**
     * 操作人ID
     */
    private Long operatorId;

    /**
     * 操作人姓名
     */
    private String operatorName;

    /**
     * 目标类型
     */
    private String targetType;

    /**
     * 目标ID
     */
    private String targetId;

    /**
     * 目标名称
     */
    private String targetName;

    /**
     * 操作原因
     */
    private String reason;

    /**
     * 详细信息（JSON格式）
     */
    private String details;

    /**
     * 操作IP
     */
    private String ip;

    /**
     * 浏览器信息
     */
    private String userAgent;

    /**
     * 操作时间
     */
    private LocalDateTime operationTime;

    /**
     * 状态：success/failure
     */
    private String status;

    /**
     * 错误信息
     */
    private String errorMessage;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
