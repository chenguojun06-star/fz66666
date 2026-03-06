package com.fashion.supplychain.intelligence.dto;

import java.math.BigDecimal;
import java.util.List;
import lombok.Data;

@Data
public class LiveCostTrackerResponse {
    private List<OrderCost> orders;
    private BigDecimal totalLaborCost;
    private BigDecimal totalQuotedRevenue;
    private double avgProfitMargin;
    private int negativeCount;  // 利润为负的订单数

    @Data
    public static class OrderCost {
        private String orderId;
        private String orderNo;
        private String styleNo;
        private String factoryName;
        private Integer quantity;
        private BigDecimal laborCost;       // 实际工资成本
        private BigDecimal quotedRevenue;   // 报价收入 = 单价 × 数量
        private BigDecimal estimatedProfit; // 估算利润
        private double profitMargin;        // 利润率 %
        private String profitLevel;         // HIGH / NORMAL / LOW / NEGATIVE
    }
}
