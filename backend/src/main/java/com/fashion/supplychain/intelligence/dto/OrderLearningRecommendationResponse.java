package com.fashion.supplychain.intelligence.dto;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class OrderLearningRecommendationResponse {

    private boolean hasLearningData;

    private String styleNo;

    private Integer sameStyleCaseCount;

    private String recommendationTitle;

    private String recommendationSummary;

    private String recommendedFactoryMode;

    private String recommendedPricingMode;

    private BigDecimal recommendedUnitPrice;

    private String costInsight;

    private String deliveryInsight;

    private String riskInsight;

    private String confidenceLevel;

    private String currentFactoryMode;

    private String currentPricingMode;

    private BigDecimal currentUnitPrice;

    private Boolean factoryModeAligned;

    private Boolean pricingModeAligned;

    private BigDecimal extraUnitCostIfKeepCurrent;

    private BigDecimal extraTotalCostIfKeepCurrent;

    private String gapInsight;

    private String actionSuggestion;

    private List<String> recommendationTags = new ArrayList<>();

    private List<OrderLearningCaseItem> recentCases = new ArrayList<>();

    private List<SimilarStyleCaseItem> similarStyleCases = new ArrayList<>();

    private List<FactoryScoreItem> factoryScores = new ArrayList<>();

    @Data
    public static class OrderLearningCaseItem {
        private String orderNo;
        private String factoryMode;
        private String factoryName;
        private String pricingMode;
        private BigDecimal selectedUnitPrice;
        private BigDecimal totalCostUnitPrice;
        private BigDecimal actualUnitCost;
        private Integer orderQuantity;
        private Integer delayDays;
        private BigDecimal scatterExtraPerPiece;
        private String outcomeSummary;
        private String createdAt;
    }

    @Data
    public static class SimilarStyleCaseItem {
        private String styleNo;
        private String styleName;
        private String factoryMode;
        private String pricingMode;
        private BigDecimal selectedUnitPrice;
        private Integer orderQuantity;
        private BigDecimal scatterExtraPerPiece;
        private String outcomeSummary;
        private String createdAt;
    }

    @Data
    public static class FactoryScoreItem {
        private String factoryMode;
        private String factoryName;
        private Integer orderCount;
        private BigDecimal avgUnitPrice;
        private Integer avgDelayDays;
        private BigDecimal avgOutcomeScore;
        private String scoreSummary;
    }
}
