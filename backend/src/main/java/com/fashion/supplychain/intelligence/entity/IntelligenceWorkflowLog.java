package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 智能工作流日志实体
 *
 * 对应表：t_intelligence_workflow_log
 * 记录每次命令执行后触发的级联工作流信息，用于审计和追踪
 */
@Data
@TableName("t_intelligence_workflow_log")
public class IntelligenceWorkflowLog {

    @TableId("id")
    private String id;

    @TableField("tenant_id")
    private Long tenantId;

    /**
     * 触发命令ID（关联 t_intelligence_audit_log.command_id）
     */
    @TableField("command_id")
    private String commandId;

    /**
     * 工作流类型（如：order_hold_cascade、order_expedite_cascade）
     */
    @TableField("workflow_type")
    private String workflowType;

    /**
     * 触发的任务列表（JSON数组）
     */
    @TableField("triggered_tasks")
    private String triggeredTasks;

    /**
     * 被通知的团队（逗号分隔）
     */
    @TableField("notified_teams")
    private String notifiedTeams;

    /**
     * 级联任务数量
     */
    @TableField("cascaded_count")
    private Integer cascadedCount;

    /**
     * 工作流状态：COMPLETED / PARTIAL_FAILED / FAILED
     */
    @TableField("status")
    private String status;

    @TableField("error_message")
    private String errorMessage;

    @TableField("created_at")
    private LocalDateTime createdAt;

    @TableField("completed_at")
    private LocalDateTime completedAt;

    @TableField("remark")
    private String remark;

    @TableField("deleted_flag")
    private Integer deletedFlag;
}
