package com.fashion.supplychain.intelligence.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

/**
 * 工厂产能缺口预测响应 DTO（B2）
 */
@Data
public class CapacityGapResponse {

    /** 分析工厂数 */
    private int totalFactories;
    /** 有产能缺口的工厂数 */
    private int gapFactoryCount;
    /** 各工厂产能缺口明细 */
    private List<FactoryCapacityGap> factories = new ArrayList<>();

    @Data
    public static class FactoryCapacityGap {
        /** 工厂名 */
        private String factoryName;
        /** 在手订单总件数 */
        private int pendingQuantity;
        /** 最近30天日均产出（扫码成功件数/天） */
        private double dailyCapacity;
        /** 预计完成所有订单所需天数 */
        private int estimatedDaysToComplete;
        /** 最近的计划交期（yyyy-MM-dd） */
        private String nearestDueDate;
        /** 距最近交期剩余天数 */
        private int daysToNearestDue;
        /** 产能缺口天数（> 0 表示来不及）*/
        private int gapDays;
        /** 缺口等级：safe / tight / gap / critical */
        private String gapLevel;
        /** 建议文案 */
        private String advice;
    }
}
