package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * 完工日期AI预测请求
 */
@Data
public class DeliveryPredictionRequest {
    /** 订单ID */
    private Long orderId;
}
