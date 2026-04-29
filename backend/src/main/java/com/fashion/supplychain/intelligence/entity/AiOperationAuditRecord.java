package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_ai_operation_audit")
public class AiOperationAuditRecord {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String sessionId;

    private String toolName;

    private String riskLevel;

    private String inputSummary;

    private String outputSummary;

    private String approvalStatus;

    private String approvedBy;

    private LocalDateTime approvedAt;

    private Integer executionTimeMs;

    private Boolean success;

    private String errorMessage;

    private Long operatorId;

    private String operatorName;

    private LocalDateTime createdAt;
}
