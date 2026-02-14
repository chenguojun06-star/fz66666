package com.fashion.supplychain.dashboard.dto;

import lombok.Data;
import java.util.List;

/**
 * 交期预警响应DTO
 * 包含紧急订单(1-4天)和预警订单(5-7天)两个列表
 */
@Data
public class DeliveryAlertResponse {
    /**
     * 紧急订单列表（1-4天）
     */
    private List<DeliveryAlertOrderDto> urgentOrders;

    /**
     * 预警订单列表（5-7天）
     */
    private List<DeliveryAlertOrderDto> warningOrders;
}
