package com.fashion.supplychain.intelligence.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

/**
 * 订单交期风险评估响应 DTO
 */
@Data
public class DeliveryRiskResponse {
    private List<DeliveryRiskItem> orders = new ArrayList<>();

    @Data
    public static class DeliveryRiskItem {
        private String orderId;
        private String orderNo;
        private String styleNo;
        private String factoryName;
        /** 计划交期 */
        private String plannedEndDate;
        /** 预计完工日期 */
        private String predictedEndDate;
        /** 风险等级：safe / warning / danger / overdue */
        private String riskLevel;
        /** 计划剩余天数 */
        private int daysLeft;
        /** 预测还需天数 */
        private int predictedDaysNeeded;
        /** 当前总进度% */
        private int currentProgress;
        /** 需要的日均产量（件） */
        private int requiredDailyOutput;
        /** 当前日均产量（件） */
        private int currentDailyOutput;
        /** 一句话风险描述 */
        private String riskDescription;
    }
}
