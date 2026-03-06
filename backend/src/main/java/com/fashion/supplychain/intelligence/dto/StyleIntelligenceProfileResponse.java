package com.fashion.supplychain.intelligence.dto;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class StyleIntelligenceProfileResponse {

    private Long styleId;
    private String styleNo;
    private String styleName;
    private String category;
    private String progressNode;
    private String deliveryDate;
    private Integer daysToDelivery;
    private String deliveryRisk;
    private Integer developmentCompletionRate;
    private String developmentStatus;

    private ProductionSummary production = new ProductionSummary();
    private ScanSummary scan = new ScanSummary();
    private StockSummary stock = new StockSummary();
    private FinanceSummary finance = new FinanceSummary();
    private TenantPreferenceProfile tenantProfile = new TenantPreferenceProfile();
    private List<StageStatus> stages = new ArrayList<>();
    private List<String> insights = new ArrayList<>();

    @Data
    public static class ProductionSummary {
        private Integer orderCount = 0;
        private Integer activeOrderCount = 0;
        private Integer delayedOrderCount = 0;
        private Integer totalOrderQuantity = 0;
        private Integer totalCompletedQuantity = 0;
        private Integer avgProductionProgress = 0;
        private String latestOrderNo;
        private String latestOrderStatus;
        private Integer latestProductionProgress = 0;
        private String latestPlannedEndDate;
        private String topRiskOrderNo;
        private String topRiskOrderStatus;
        private String topRiskReason;
        private String topRiskFactoryName;
        private String topRiskFactoryReason;
    }

    @Data
    public static class ScanSummary {
        private Integer totalRecords = 0;
        private Integer successRecords = 0;
        private Integer failedRecords = 0;
        private Integer successQuantity = 0;
        private Integer settledRecordCount = 0;
        private Integer unsettledRecordCount = 0;
        private String latestScanTime;
        private String latestProgressStage;
        private String latestProcessName;
        private String topAnomalyProcessName;
        private String topAnomalyStage;
        private Integer topAnomalyCount = 0;
    }

    @Data
    public static class StockSummary {
        private Integer totalQuantity = 0;
        private Integer loanedQuantity = 0;
        private Integer availableQuantity = 0;
        private Integer developmentQuantity = 0;
        private Integer preProductionQuantity = 0;
        private Integer shipmentQuantity = 0;
    }

    @Data
    public static class FinanceSummary {
        private BigDecimal currentQuotation;
        private BigDecimal suggestedQuotation;
        private BigDecimal materialCost;
        private BigDecimal processCost;
        private BigDecimal totalCost;
        private BigDecimal estimatedRevenue;
        private BigDecimal estimatedProcessingCost;
        private BigDecimal estimatedGrossProfit;
        private BigDecimal estimatedGrossMargin;
        private Integer historicalOrderCount = 0;
        private BigDecimal quotationGap;
        private String costPressureSource;
        private BigDecimal costPressureAmount;
    }

    @Data
    public static class TenantPreferenceProfile {
        private String primaryGoal = "DELIVERY";
        private String primaryGoalLabel = "交期优先";
        private Integer deliveryWarningDays = 3;
        private Integer anomalyWarningCount = 5;
        private BigDecimal lowMarginThreshold = BigDecimal.valueOf(5);
        private String topRiskFactoryName;
        private String topRiskFactoryReason;
    }

    @Data
    public static class StageStatus {
        private String key;
        private String label;
        private String status;
        private String assignee;
        private String startTime;
        private String completedTime;
    }
}
