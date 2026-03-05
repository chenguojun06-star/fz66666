package com.fashion.supplychain.intelligence.dto;

import java.math.BigDecimal;
import lombok.Data;

/**
 * 订单利润预估响应 — 成本结构 + 毛利率仪表盘
 */
@Data
public class ProfitEstimationResponse {
    private String orderId;
    private String orderNo;
    /** 客户报价总额 */
    private BigDecimal quotationTotal;
    /** 已确认工厂成本 */
    private BigDecimal factoryCost;
    /** 面辅料成本 */
    private BigDecimal materialCost;
    /** 已发放工资 */
    private BigDecimal wageCost;
    /** 其他费用 */
    private BigDecimal otherCost;
    /** 总成本 */
    private BigDecimal totalCost;
    /** 预估利润 = 报价 - 总成本 */
    private BigDecimal estimatedProfit;
    /** 毛利率 % */
    private double grossMarginPct;
    /** 利润状态：盈利 / 微利 / 亏损 */
    private String profitStatus;
    /** 成本偏差预警 */
    private String costWarning;
}
