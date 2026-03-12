package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

@Data
public class ActionTaskFeedbackItem {

    private String taskCode;

    private String relatedOrderNo;

    private String feedbackStatus;

    private String feedbackReason;

    private String completionNote;

    private String sourceSignal;

    private String nextReviewAt;

    private String operatorId;

    private String operatorName;

    private String feedbackTime;
}
