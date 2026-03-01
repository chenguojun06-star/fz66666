package com.fashion.supplychain.intelligence.dto;

import java.math.BigDecimal;
import java.util.List;
import lombok.Data;

/**
 * 款式报价建议响应 — 基于历史订单数据提供报价参考
 */
@Data
public class StyleQuoteSuggestionResponse {
    /** 款号 */
    private String styleNo;
    /** 历史订单数量 */
    private int historicalOrderCount;
    /** 历史总件数 */
    private int historicalTotalQuantity;
    /** 当前报价（来自款号报价单） */
    private BigDecimal currentQuotation;
    /** 物料成本（来自BOM） */
    private BigDecimal materialCost;
    /** 工序成本（来自工序配置） */
    private BigDecimal processCost;
    /** 总成本 = 物料 + 工序 */
    private BigDecimal totalCost;
    /** 建议报价（总成本 × 1.2） */
    private BigDecimal suggestedPrice;
    /** 历史订单明细（最近5单） */
    private List<HistoricalOrder> recentOrders;
    /** 建议文案 */
    private String suggestion;

    @Data
    public static class HistoricalOrder {
        /** 订单号 */
        private String orderNo;
        /** 件数 */
        private int quantity;
        /** 报价单价 */
        private BigDecimal unitPrice;
        /** 创建时间 */
        private String createTime;
        /** 状态 */
        private String status;
    }
}
