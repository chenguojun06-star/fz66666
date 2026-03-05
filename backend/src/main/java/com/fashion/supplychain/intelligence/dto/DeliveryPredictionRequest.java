package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * 完工日期AI预测请求
 */
@Data
public class DeliveryPredictionRequest {
    /** 订单号或订单ID，均可，如 PO20260228001 或 20260228001 */
    private String orderId;
}
