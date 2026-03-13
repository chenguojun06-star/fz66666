package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_decision_memory")
public class DecisionMemory {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** scheduling|pricing|sourcing|quality|delivery|escalation */
    private String decisionType;

    private String scene;

    private String contextSnapshot;

    private String decisionContent;

    private String rationale;

    private String expectedOutcome;

    private String actualOutcome;

    private Integer outcomeScore;

    private String lessonLearned;

    private String linkedOrderIds;

    private String agentSource;

    private String executionId;

    private Integer confidenceAtDecision;

    private Integer confidenceAfterOutcome;

    /** pending|outcome_recorded|lesson_extracted|archived */
    private String status;

    private Integer deleteFlag;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
