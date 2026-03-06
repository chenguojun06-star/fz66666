package com.fashion.supplychain.intelligence.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
public class PainPointResponse {
    private Long id;
    private String painCode;
    private String painName;
    private String painLevel;
    private String businessDomain;
    private Integer triggerCount;
    private Integer affectedOrderCount;
    private BigDecimal affectedAmount;
    private LocalDateTime latestTriggerTime;
    private String rootReasonSummary;
    private String currentStatus;
}
