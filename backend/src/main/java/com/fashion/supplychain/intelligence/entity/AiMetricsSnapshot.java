package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_ai_metrics_snapshot")
public class AiMetricsSnapshot {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private LocalDate snapshotDate;

    private BigDecimal intentHitRate;

    private BigDecimal toolCallSuccessRate;

    private BigDecimal firstResponseAcceptRate;

    private BigDecimal manualOverrideRate;

    private Integer approvalTurnaroundAvgMinutes;

    private Integer totalAiRequests;

    private Integer totalToolCalls;

    private Integer totalEscalations;

    private Integer activeCollabTasks;

    private Integer overdueCollabTasks;

    private BigDecimal avgAgentIterations;

    private Integer costEstimatedCents;

    private String metricsJson;

    private LocalDateTime createdAt;
}
