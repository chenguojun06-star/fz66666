package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * 自动排产建议请求
 */
@Data
public class SchedulingSuggestionRequest {
    /** 款式编号 */
    private String styleNo;
    /** 订单数量 */
    private Integer quantity;
    /** 期望完工日期 yyyy-MM-dd */
    private String deadline;
}
