package com.fashion.supplychain.dashboard.dto;

import java.util.List;
import lombok.Data;

@Data
public class DashboardResponse {
    private long styleCount;
    private long productionCount;
    private long pendingReconciliationCount;
    private long paymentApprovalCount;
    private long todayScanCount;
    private long warehousingOrderCount;
    private long unqualifiedQuantity;
    private long urgentEventCount;
    private List<DashboardActivityDto> recentActivities;
}

