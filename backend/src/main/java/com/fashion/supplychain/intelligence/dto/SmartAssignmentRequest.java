package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * 智能派工推荐请求 DTO
 */
@Data
public class SmartAssignmentRequest {
    /** 工序名称（如"车缝"、"裁剪"） */
    private String stageName;
    /** 订单件数 */
    private Integer quantity;
    /** 订单ID（可选，用于关联） */
    private String orderId;
}
