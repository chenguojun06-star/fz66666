package com.fashion.supplychain.intelligence.dto;

import java.util.List;
import lombok.Data;

/**
 * 预下单交期预测响应 — 三档置信区间 + 工厂在手负载
 *
 * <p>与 DeliveryPredictionResponse 区别：
 * <ul>
 *   <li>不含 orderId/orderNo（预下单阶段订单尚未创建）</li>
 *   <li>新增 factoryPendingQuantity（工厂当前在手总件数，含本单）</li>
 *   <li>新增 factoryDailyVelocity（工厂级日均产能，基于近14天扫码聚合）</li>
 *   <li>新增 timelineNodes（时间线节点，前端可直接渲染）</li>
 * </ul>
 */
@Data
public class PreOrderDeliveryPredictionResponse {
    /** 工厂名 */
    private String factoryName;
    /** 本单数量 */
    private int orderQuantity;
    /** 工厂当前在手总件数（含本单预估） */
    private long factoryPendingQuantity;
    /** 工厂级日均产能（件/天，基于近14天扫码聚合） */
    private double factoryDailyVelocity;
    /** 乐观预测日期 yyyy-MM-dd */
    private String optimisticDate;
    /** 最可能预测日期 */
    private String mostLikelyDate;
    /** 悲观预测日期 */
    private String pessimisticDate;
    /** 乐观天数 */
    private int optimisticDays;
    /** 最可能天数 */
    private int mostLikelyDays;
    /** 悲观天数 */
    private int pessimisticDays;
    /** 计划交期 */
    private String plannedDeadline;
    /** 是否预计延期 */
    private boolean likelyDelayed;
    /** 预测置信度 0-100 */
    private int confidence;
    /** 预测依据说明 */
    private String rationale;
    /** 时间线节点（前端可视化用） */
    private List<TimelineNode> timelineNodes;

    @Data
    public static class TimelineNode {
        /** 节点类型：today / optimistic / mostLikely / pessimistic / plannedDeadline */
        private String type;
        /** 日期 yyyy-MM-dd */
        private String date;
        /** 距今天数 */
        private int daysFromToday;
        /** 显示标签 */
        private String label;
        /** 风险等级：safe / warning / danger */
        private String riskLevel;

        public TimelineNode(String type, String date, int daysFromToday, String label, String riskLevel) {
            this.type = type;
            this.date = date;
            this.daysFromToday = daysFromToday;
            this.label = label;
            this.riskLevel = riskLevel;
        }
    }
}
