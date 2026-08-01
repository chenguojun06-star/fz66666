package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/**
 * AI 主动巡检闭环行动
 * <p>巡检发现问题 → 生成命令 → 自动/审批执行 → 跟踪到关闭，统计 MTTR。</p>
 */
@Data
@TableName("t_ai_patrol_action")
public class AiPatrolAction {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String actionUid;
    private Long tenantId;

    /** AiPatrolJob / AnomalyDetection / Manual */
    private String patrolSource;

    private String detectedIssue;

    /** ORDER_OVERDUE / MATERIAL_SHORT / PROCESS_STAGNANT / QUALITY_DEFECT 等 */
    private String issueType;

    /** LOW / MEDIUM / HIGH / CRITICAL */
    private String issueSeverity;

    private String targetType;
    private String targetId;

    /** 建议动作命令 JSON */
    private String suggestedActionJson;

    private BigDecimal confidence;

    /** AUTO_EXEC / NEED_APPROVAL / HUMAN_ONLY */
    private String riskLevel;

    /** PENDING / APPROVED / REJECTED / EXECUTED / CLOSED / AUTO_EXECUTED */
    private String status;

    private Integer autoExecuted;
    private String executionResult;
    private LocalDateTime executionTime;

    private String approverId;
    private String approverName;
    private LocalDateTime approvalTime;
    private String approvalRemark;

    private LocalDateTime closeTime;
    private Integer mttrMinutes;

    private String linkedAuditId;

    /** 执行人ID（区别于审批人） */
    private String executedBy;
    /** 执行人姓名 */
    private String executedByName;
    /** 人员反馈 */
    private String feedback;
    /** 反馈评分1-5 */
    private Integer feedbackRating;
    /** 撤销原因 */
    private String cancelReason;
    /** 撤销人ID */
    private String cancelledBy;
    /** 撤销时间 */
    private LocalDateTime cancelledAt;
    /** 自愈类型: AUTO/SUGGESTION */
    private String remediationType;

    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
