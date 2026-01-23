package com.fashion.supplychain.dashboard.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 紧急事件DTO
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UrgentEventDto {
    /**
     * 事件ID
     */
    private String id;
    
    /**
     * 事件类型: overdue(延期订单), defective(次品), approval(审批)
     */
    private String type;
    
    /**
     * 事件标题
     */
    private String title;
    
    /**
     * 订单号
     */
    private String orderNo;
    
    /**
     * 事件时间
     */
    private String time;
}
