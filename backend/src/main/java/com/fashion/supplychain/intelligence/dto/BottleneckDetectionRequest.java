package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * 瓶颈检测请求 DTO
 */
@Data
public class BottleneckDetectionRequest {
    /** 订单ID（单订单瓶颈分析） */
    private String orderId;
    /** 订单编号（批量分析时为空） */
    private String orderNo;
}
