package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

@Data
public class PrecheckIssue {
    private String code;
    private String level;
    private String title;
    private String reason;
    private String suggestion;
}
