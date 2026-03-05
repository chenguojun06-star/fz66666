package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * 订单利润预估请求
 */
@Data
public class ProfitEstimationRequest {
    /** 订单号或订单ID，均可，如 PO20260228001 或 20260228001 */
    private String orderId;
}
