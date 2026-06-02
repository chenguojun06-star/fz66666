package com.fashion.supplychain.intelligence.engine.dto;

import lombok.Data;

@Data
public class ExecutionRequest {
    private String query;
    private Long tenantId;
    private Long userId;
    private String sessionId;
    private String intent;
}
