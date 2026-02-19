package com.fashion.supplychain.dashboard.dto;

import java.util.List;
import lombok.Data;

@Data
public class DashboardResponse {
    // 8个统计指标
    private long sampleDevelopmentCount;     // 样衣开发
    private long productionOrderCount;       // 生产订单
    private long orderQuantityTotal;         // 订单数量
    private long overdueOrderCount;          // 延期订单
    private long todayScanCount;             // 当天生产件数
    private long totalScanCount;             // 生产总件数
    private long todayWarehousingCount;      // 当天入库
    private long totalWarehousingCount;      // 入库总数
    private long defectiveQuantity;          // 次品数量
    private long paymentApprovalCount;       // 审批付款

    private List<DashboardActivityDto> recentActivities;
}


