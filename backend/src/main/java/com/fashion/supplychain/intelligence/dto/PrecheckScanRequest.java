package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

@Data
public class PrecheckScanRequest {
    private String orderId;
    private String orderNo;
    private String stageName;
    private String processName;
    private Integer quantity;
    private String operatorId;
    private String operatorName;
}
