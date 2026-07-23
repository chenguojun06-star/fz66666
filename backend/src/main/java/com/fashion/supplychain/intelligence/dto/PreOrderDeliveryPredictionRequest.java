package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/**
 * 预下单交期预测请求（不依赖 orderId）
 *
 * <p>用于下单人员在选择工厂后，输入订单数量即可预测三档完工日期，
 * 无需先创建订单再预测，实现"下单前可见时间线"。
 */
@Data
public class PreOrderDeliveryPredictionRequest {
    /** 工厂名（必填，与 ProductionOrder.factoryName 对齐） */
    private String factoryName;
    /** 本单计划数量（必填） */
    private Integer orderQuantity;
    /** 款号（可选，用于历史同款产能参考） */
    private String styleNo;
    /** 计划交期 yyyy-MM-dd（可选，用于判断是否延期） */
    private String plannedDeadline;
}
