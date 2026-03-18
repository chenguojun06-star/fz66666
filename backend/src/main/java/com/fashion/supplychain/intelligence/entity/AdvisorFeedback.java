package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_advisor_feedback")
public class AdvisorFeedback {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private String userId;
    private String sessionId;
    private String traceId;
    private String queryText;
    private String adviceText;
    private Double score;
    private String feedbackText;
    private Integer harvested;
    private String harvestedKbId;
    private LocalDateTime createTime;
}
