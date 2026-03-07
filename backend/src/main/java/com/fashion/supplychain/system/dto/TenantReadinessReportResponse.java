package com.fashion.supplychain.system.dto;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.Data;

/**
 * 租户运营健康报告响应
 */
@Data
public class TenantReadinessReportResponse {

    private Long tenantId;
    private String tenantName;
    private String tenantStatus;
    private String paidStatus;
    private String planType;
    private LocalDateTime expireTime;

    private int readinessScore;
    private String readinessLevel;
    private LocalDateTime generatedAt;

    private Metrics metrics = new Metrics();
    private List<String> highlights = new ArrayList<>();
    private List<RiskItem> risks = new ArrayList<>();

    @Data
    public static class Metrics {
        private int inconsistentOrders;
        private int stalePendingBills;
        private int expiringSubscriptions;
        private int expiredSubscriptions;
        private int userUsagePercent;
        private int storageUsagePercent;
    }

    @Data
    public static class RiskItem {
        private String code;
        private String title;
        private String detail;
        private int penalty;
        private String severity;

        public static RiskItem of(String code, String title, String detail, int penalty, String severity) {
            RiskItem item = new RiskItem();
            item.setCode(code);
            item.setTitle(title);
            item.setDetail(detail);
            item.setPenalty(penalty);
            item.setSeverity(severity);
            return item;
        }
    }
}
