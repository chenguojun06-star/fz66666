package com.fashion.supplychain.intelligence.dto;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class FeedbackRequest {
    private String predictionId;
    private String orderId;
    private String orderNo;
    private String stageName;
    private String processName;
    private LocalDateTime predictedFinishTime;
    private LocalDateTime actualFinishTime;
    private String actualResult;
    private Boolean acceptedSuggestion;
}
