package com.fashion.supplychain.finance.orchestration;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
class PayrollSettlementQuery {
    private String orderId;
    private String orderNo;
    private String styleNo;
    private String operatorId;
    private String operatorName;
    private String scanType;
    private String processName;
    private boolean includeSettled;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
}
