package com.fashion.supplychain.production.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 订单智能数据分析响应 VO
 * <p>覆盖：总览 / 近30天下单趋势 / 工厂时效排行 / 次品率排行 / 毛利估算</p>
 *
 * @author AI Agent
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class OrderAnalyticsVO {

    /** 总览 */
    private Overview overview;
    /** 近30天下单趋势（有数据的日期） */
    private List<TrendItem> trend;
    /** 工厂时效排行（按时效升序，TopN） */
    private List<FactoryRankItem> factoryRanking;
    /** 次品率排行（按款号，按次品数降序，TopN） */
    private List<DefectRankItem> defectRanking;
    /** 毛利估算 */
    private Margin margin;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Overview {
        /** 订单总数 */
        private long orderCount;
        /** 总件数 */
        private long totalQuantity;
        /** 销售金额估算（下单数量 × 下单单价） */
        private double totalAmount;
        /** 在产订单数 */
        private long inProductionCount;
        /** 已完成订单数 */
        private long completedCount;
        /** 逾期订单数 */
        private long overdueCount;
        /** 平均完工天数（-1=无数据） */
        private double avgCompletionDays;
        /** 平均次品率（-1=无数据） */
        private double avgDefectRate;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TrendItem {
        /** 日期 yyyy-MM-dd */
        private String date;
        private long orderCount;
        private long quantity;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FactoryRankItem {
        private String factoryName;
        private long completedOrders;
        /** 平均完工天数（-1=无数据） */
        private double avgCompletionDays;
        /** 准时交付率 %（-1=无数据） */
        private double onTimeRate;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DefectRankItem {
        private String styleNo;
        private String styleName;
        private long total;
        private long failCount;
        /** 次品率 % */
        private double defectRate;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Margin {
        /** 销售金额估算 */
        private double salesAmount;
        /** 物料成本合计（面辅料采购成本） */
        private double materialCost;
        /** 毛利估算 = 销售金额 - 总成本（优先 total_cost，兜底 material_cost） */
        private double grossProfit;
        /** 毛利率估算 %（-1=无成本数据） */
        private double grossMarginRate;
        /** 是否有成本数据 */
        private boolean hasCostData;
    }
}
