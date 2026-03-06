package com.fashion.supplychain.system.dto;

import java.math.BigDecimal;
import lombok.Data;

@Data
public class TenantIntelligenceProfileResponse {

    private String primaryGoal = "DELIVERY";
    private String primaryGoalLabel = "交期优先";
    private Integer deliveryWarningDays = 3;
    private Integer anomalyWarningCount = 5;
    private BigDecimal lowMarginThreshold = BigDecimal.valueOf(5);
    private Boolean manualConfigured = false;
    private String topRiskFactoryName;
    private String topRiskFactoryReason;
    private String updateTime;
    private LearnedProfile learnedProfile = new LearnedProfile();

    @Data
    public static class LearnedProfile {
        private String primaryGoal = "DELIVERY";
        private String primaryGoalLabel = "交期优先";
        private Integer deliveryWarningDays = 3;
        private Integer anomalyWarningCount = 5;
        private BigDecimal lowMarginThreshold = BigDecimal.valueOf(5);
        private String topRiskFactoryName;
        private String topRiskFactoryReason;
    }
}
