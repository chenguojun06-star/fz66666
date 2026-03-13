package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_goal_decomposition")
public class GoalDecomposition {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private Long parentGoalId;

    /** business|production|quality|cost|delivery */
    private String goalType;

    private String title;

    private String description;

    private String metricName;

    private BigDecimal metricCurrent;

    private BigDecimal metricTarget;

    private String metricUnit;

    /** low|medium|high|critical */
    private String priority;

    private LocalDateTime deadline;

    private Integer progress;

    private String aiSource;

    private Long linkedPatternId;

    private Long linkedRcaId;

    /** active|completed|cancelled|blocked */
    private String status;

    private String completionNote;

    private Integer deleteFlag;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
