package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_intelligence_action_task_feedback")
public class IntelligenceActionTaskFeedback {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String taskCode;

    private String relatedOrderNo;

    private String feedbackStatus;

    private String feedbackReason;

    private String completionNote;

    private String sourceSignal;

    private String nextReviewAt;

    private String operatorId;

    private String operatorName;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    private Integer deleteFlag;
}
