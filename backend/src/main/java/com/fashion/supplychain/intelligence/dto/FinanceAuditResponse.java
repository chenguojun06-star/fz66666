package com.fashion.supplychain.intelligence.dto;

import java.math.BigDecimal;
import java.util.List;
import lombok.Data;

/**
 * 财务审核智能分析响应
 *
 * <p>提供结算差异检测、单价偏离预警、重复结算检查、利润率分级、审核建议五大能力
 */
@Data
public class FinanceAuditResponse {

    /** 整体风险评级: LOW / MEDIUM / HIGH */
    private String overallRisk;

    /** AI审核建议: APPROVE / REVIEW / REJECT */
    private String suggestion;

    /** 建议说明文案 */
    private String suggestionText;

    /** 订单汇总统计 */
    private Summary summary;

    /** 异常发现列表 */
    private List<AuditFinding> findings;

    /** 利润率分析 */
    private ProfitAnalysis profitAnalysis;

    /** 单价偏离检测结果 */
    private List<PriceDeviation> priceDeviations;

    @Data
    public static class Summary {
        /** 分析订单数 */
        private int totalOrders;
        /** 已入库总数 */
        private int totalWarehousedQty;
        /** 结算总金额 */
        private BigDecimal totalSettlementAmount;
        /** 异常数 */
        private int anomalyCount;
        /** 高风险数 */
        private int highRiskCount;
        /** 重复结算嫌疑数 */
        private int duplicateSuspectCount;
    }

    @Data
    public static class AuditFinding {
        /** 发现类型: QUANTITY_MISMATCH / PRICE_DEVIATION / DUPLICATE_SETTLEMENT / PROFIT_ANOMALY / COST_OVERRUN */
        private String type;
        /** 风险级别: LOW / MEDIUM / HIGH */
        private String riskLevel;
        /** 关联订单号 */
        private String orderNo;
        /** 发现描述 */
        private String description;
        /** 涉及金额 */
        private BigDecimal amount;
        /** 建议操作 */
        private String action;
    }

    @Data
    public static class ProfitAnalysis {
        /** 平均利润率 */
        private BigDecimal avgProfitMargin;
        /** 负利润订单数 */
        private int negativeCount;
        /** 异常高利润订单数(>30%) */
        private int abnormalHighCount;
        /** 低利润预警订单数(<5%) */
        private int lowProfitCount;
        /** 正常利润订单数 */
        private int normalCount;
    }

    @Data
    public static class PriceDeviation {
        /** 订单号 */
        private String orderNo;
        /** 款号 */
        private String styleNo;
        /** 工厂名 */
        private String factoryName;
        /** 当前工厂单价 */
        private BigDecimal currentPrice;
        /** 历史平均单价 */
        private BigDecimal avgHistoryPrice;
        /** 偏离百分比(%) */
        private BigDecimal deviationPercent;
        /** 风险级别 */
        private String riskLevel;
    }
}
