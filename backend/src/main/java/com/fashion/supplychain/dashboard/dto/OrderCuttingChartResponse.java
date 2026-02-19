package com.fashion.supplychain.dashboard.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 订单与裁剪数量折线图响应
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OrderCuttingChartResponse {
    /**
     * 日期列表
     */
    private List<String> dates;

    /**
     * 下单数量列表
     */
    private List<Integer> orderQuantities;

    /**
     * 裁剪数量列表
     */
    private List<Integer> cuttingQuantities;
}
