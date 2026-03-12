package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

@Data
public class ActionTaskFeedbackRequest {

    private String taskCode;

    private String relatedOrderNo;

    /** PROCESSING / COMPLETED / REJECTED */
    private String feedbackStatus;

    private String feedbackReason;

    private String completionNote;

    private String sourceSignal;

    private String nextReviewAt;
}
