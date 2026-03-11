package com.fashion.supplychain.intelligence.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

/**
 * 对账异常优先级排序响应 DTO（B5）
 */
@Data
public class ReconciliationAnomalyResponse {

    /** 分析对账单总数 */
    private int totalChecked;
    /** 异常数量 */
    private int anomalyCount;
    /** 异常对账单（按优先级排序） */
    private List<ReconciliationAnomalyItem> items = new ArrayList<>();

    @Data
    public static class ReconciliationAnomalyItem {
        private String reconciliationId;
        private String reconciliationNo;
        private String orderNo;
        private String styleNo;
        private String factoryName;
        /** 异常类型：high_deduction / low_profit / overdue_pending / price_deviation */
        private String anomalyType;
        /** 异常描述 */
        private String anomalyDesc;
        /** 扣款金额（元） */
        private double deductionAmount;
        /** 利润率% */
        private double profitMarginPct;
        /** 对账状态 */
        private String status;
        /** 对账创建时间 */
        private String createTime;
        /** 挂单天数（创建至今） */
        private int pendingDays;
        /** 优先级分（越高越紧急） */
        private double priorityScore;
        /** 处理建议 */
        private String advice;
    }
}
