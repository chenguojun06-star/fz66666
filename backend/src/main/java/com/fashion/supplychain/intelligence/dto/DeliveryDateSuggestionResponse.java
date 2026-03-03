package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * 交货期智能建议响应
 */
@Data
public class DeliveryDateSuggestionResponse {
    /** 建议最少天数（乐观） */
    private int earliestDays;
    /** 建议标准天数 */
    private int recommendedDays;
    /** 建议最多天数（保守） */
    private int latestDays;
    /** 工厂当前日均产量 */
    private double factoryAvgDailyOutput;
    /** 工厂在制订单数 */
    private int factoryInProgressOrders;
    /** 工厂在制总件数 */
    private int factoryInProgressQty;
    /** 历史货期完成率 0-100，-1表示无数据 */
    private int factoryOnTimeRate;
    /** 置信度 0.0-1.0 */
    private double confidence;
    /** 建议理由 */
    private String reason;
    /** 算法说明 */
    private String algorithm;
}
