package com.fashion.supplychain.intelligence.dto;

import java.math.BigDecimal;
import java.util.List;
import lombok.Data;

/**
 * 实时成本追踪响应 — 订单级实时 P&L（自动按扫码工序累计人工成本）
 */
@Data
public class LiveCostResponse {

    /** 订单号 */
    private String orderNo;

    /** 款号 */
    private String styleNo;

    /** 工厂名 */
    private String factoryName;

    /** 总下单件数 */
    private int orderQuantity;

    /** 已完成件数（扫码 success 累计） */
    private int completedQty;

    /** 预估工序总成本（报价单价 × 订单件数） */
    private BigDecimal estimatedLaborCost;

    /** 已发生工序成本（实际扫码件数 × 各工序单价） */
    private BigDecimal actualLaborCost;

    /** 报价总收入（quotationUnitPrice × orderQuantity） */
    private BigDecimal estimatedRevenue;

    /** 预估利润 = estimatedRevenue - estimatedLaborCost */
    private BigDecimal estimatedProfit;

    /** 利润率（%） */
    private BigDecimal profitMargin;

    /** 成本进度（%） = actualLaborCost / estimatedLaborCost × 100 */
    private int costProgress;

    /** 各工序成本明细 */
    private List<ProcessCostItem> processBreakdown;

    /** 状态评估：ON_TRACK / OVER_BUDGET / UNDER_BUDGET */
    private String costStatus;

    /** 建议文案 */
    private String suggestion;

    @Data
    public static class ProcessCostItem {
        /** 工序名称 */
        private String processName;
        /** 单价（元/件） */
        private BigDecimal unitPrice;
        /** 已扫码件数 */
        private int scannedQty;
        /** 已发生成本 */
        private BigDecimal cost;
        /** 完成率（%） */
        private int progress;
    }
}
