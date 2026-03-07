package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_intelligence_feedback")
public class IntelligenceFeedbackRecord {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String predictionId;

    /** suggestion_adopted / suggestion_rejected / anomaly_false_positive */
    private String feedbackType;

    /** assignment / quote / delivery / anomaly */
    private String suggestionType;

    private String suggestionContent;

    /** accepted / rejected / modified */
    private String feedbackResult;

    private String feedbackReason;

    /** AI自动分析：建议未被采纳的原因、误报根源、改进方向 */
    private String feedbackAnalysis;

    private Long deviationMinutes;

    /** AI生成的针对性优化措施 */
    private String optimizationAction;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
