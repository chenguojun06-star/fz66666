package com.fashion.supplychain.system.dto;

import java.math.BigDecimal;
import lombok.Data;

@Data
public class TenantIntelligenceProfileSaveRequest {
    private String primaryGoal;
    private Integer deliveryWarningDays;
    private Integer anomalyWarningCount;
    private BigDecimal lowMarginThreshold;
}
