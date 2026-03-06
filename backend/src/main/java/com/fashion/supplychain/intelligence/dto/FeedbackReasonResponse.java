package com.fashion.supplychain.intelligence.dto;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class FeedbackReasonResponse {
    private Long id;
    private String predictionId;
    private String suggestionType;
    private Boolean accepted;
    private String reasonCode;
    private String reasonText;
    private String orderNo;
    private String stageName;
    private String processName;
    private String operatorName;
    private LocalDateTime createTime;
}
