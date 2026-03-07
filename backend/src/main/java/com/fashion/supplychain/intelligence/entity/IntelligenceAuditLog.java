package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

/**
 * 智能执行审计日志实体
 *
 * 表名：t_intelligence_audit_log
 * 用途：记录所有 AI 执行的命令和结果
 *
 * @author Intelligence Engine v1.0
 * @date 2026-03-08
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@TableName("t_intelligence_audit_log")
public class IntelligenceAuditLog {

    /** 审计日志ID */
    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    /** 租户ID（数据隔离） */
    private Long tenantId;

    /** 命令ID（用于关联） */
    private String commandId;

    /** 命令类型（如 order:hold, purchase:create） */
    private String action;

    /** 目标对象ID（如订单号、采购单号） */
    private String targetId;

    /** 执行人ID */
    private String executorId;

    /** 执行状态（EXECUTING/SUCCESS/FAILED/CANCELLED） */
    private String status;

    /** 命令的原始理由 */
    private String reason;

    /** 风险等级（1-5） */
    private Integer riskLevel;

    /** 执行结果（JSON格式） */
    private String resultData;

    /** 错误信息（失败时） */
    private String errorMessage;

    /** 执行耗时（毫秒） */
    private Long durationMs;

    /** 备注 */
    private String remark;

    /** 创建时间 */
    private LocalDateTime createdAt;

    /** 是否需要人工审核 */
    private Boolean requiresApproval;

    /** 审批人ID */
    private String approvedBy;

    /** 审批时间 */
    private LocalDateTime approvedAt;

    /** 审批备注 */
    private String approvalRemark;
}
