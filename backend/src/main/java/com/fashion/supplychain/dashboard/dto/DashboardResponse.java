package com.fashion.supplychain.dashboard.dto;

import java.util.List;
import lombok.Data;

@Data
public class DashboardResponse {
    // 新的8个统计指标
    private long sampleDevelopmentCount;     // 样衣开发
    private long productionOrderCount;       // 生产订单
    private long orderQuantityTotal;         // 订单数量
    private long overdueOrderCount;          // 延期订单
    private long todayWarehousingCount;      // 当天入库
    private long totalWarehousingCount;      // 入库总数
    private long defectiveQuantity;          // 次品数量
    private long paymentApprovalCount;       // 审批付款
    
    // 保留旧字段以兼容
    @Deprecated
    private long styleCount;
    @Deprecated
    private long productionCount;
    @Deprecated
    private long pendingReconciliationCount;
    @Deprecated
    private long todayScanCount;
    @Deprecated
    private long warehousingOrderCount;
    @Deprecated
    private long unqualifiedQuantity;
    @Deprecated
    private long urgentEventCount;
    
    private List<DashboardActivityDto> recentActivities;
}


