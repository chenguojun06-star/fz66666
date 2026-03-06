package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_intelligence_feedback_reason")
public class IntelligenceFeedbackReason {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String predictionId;
    private String suggestionType;
    private Boolean accepted;
    private String reasonCode;
    private String reasonText;
    private String orderId;
    private String orderNo;
    private String stageName;
    private String processName;
    private String operatorId;
    private String operatorName;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private Integer deleteFlag;
}
