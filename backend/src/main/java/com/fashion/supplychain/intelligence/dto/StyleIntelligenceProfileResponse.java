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
    /** 款式难度评估（结构化自动计算 + 可选 AI 图像增强分析） */
    private DifficultyAssessment difficulty;

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

    /** 款式制作难度评估（从 BOM + 工序结构数据自动计算，可选触发 AI 图像增强分析） */
    @Data
    public static class DifficultyAssessment {
        /** 难度级别：SIMPLE / MEDIUM / COMPLEX / HIGH_END */
        private String difficultyLevel;
        /** 难度分数 1-10 */
        private Integer difficultyScore;
        /** 中文难度说明：简单款 / 中等难度 / 工艺复杂 / 高定级 */
        private String difficultyLabel;
        /** BOM 物料种类数量（影响难度） */
        private Integer bomCount;
        /** 工序道数 */
        private Integer processCount;
        /** 是否含二次工艺 */
        private Boolean hasSecondaryProcess;
        /** 关键工艺要素列表（最多 5 条） */
        private List<String> keyFactors = new ArrayList<>();
        /** 报价倍率：在基础成本上叠加的难度溢价倍率（如 1.0 / 1.15 / 1.35 / 1.60） */
        private BigDecimal pricingMultiplier;
        /** 难度调整后的建议报价（= 原始 AI 建议报价 × pricingMultiplier） */
        private BigDecimal adjustedSuggestedPrice;
        /** 是否进行了 AI 图像增强分析 */
        private Boolean imageAnalyzed = false;
        /** AI 图像分析摘要（仅 imageAnalyzed=true 时有值） */
        private String imageInsight;
        /** 评估来源：STRUCTURED（仅结构数据）/ AI_ENHANCED（含图像 LLM 分析） */
        private String assessmentSource = "STRUCTURED";
    }
}
