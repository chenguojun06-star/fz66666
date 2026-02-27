package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

@Data
public class FeedbackResponse {
    private Boolean accepted;
    private Long deviationMinutes;
    private String message;
}
