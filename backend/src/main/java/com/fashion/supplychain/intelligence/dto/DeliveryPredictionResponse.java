package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * 完工日期AI预测响应 — 三档置信区间
 */
@Data
public class DeliveryPredictionResponse {
    private Long orderId;
    private String orderNo;
    /** 乐观预测日期 yyyy-MM-dd */
    private String optimisticDate;
    /** 最可能预测日期 */
    private String mostLikelyDate;
    /** 悲观预测日期 */
    private String pessimisticDate;
    /** 当前日均产量（件/天） */
    private double dailyVelocity;
    /** 剩余件数 */
    private long remainingQty;
    /** 计划交期 */
    private String plannedDeadline;
    /** 是否预计延期 */
    private boolean likelyDelayed;
    /** 预测置信度 0-100 */
    private int confidence;
    /** 预测依据说明 */
    private String rationale;
}
