package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * 订单利润预估请求
 */
@Data
public class ProfitEstimationRequest {
    private Long orderId;
}
