package com.fashion.supplychain.intelligence.dto;

import java.util.List;
import lombok.Data;

@Data
public class SupplierScorecardResponse {
    private List<SupplierScore> scores;
    private int topCount;    // S + A 档工厂数
    private String summary;

    @Data
    public static class SupplierScore {
        private String factoryName;
        private int totalOrders;
        private int completedOrders;
        private int overdueOrders;
        private double onTimeRate;    // 0-100
        private double qualityScore;  // 0-100，扫码成功率
        private double overallScore;  // 0-100，综合评分
        private String tier;          // S / A / B / C
    }
}
