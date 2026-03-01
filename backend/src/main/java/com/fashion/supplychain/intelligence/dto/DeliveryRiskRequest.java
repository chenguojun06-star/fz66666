package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * 订单交期风险评估请求 DTO
 */
@Data
public class DeliveryRiskRequest {
    /** 订单ID（空时批量分析所有进行中订单） */
    private String orderId;
}
