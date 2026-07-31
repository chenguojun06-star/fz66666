package com.fashion.supplychain.intelligence.dto;

import lombok.Data;
import java.util.List;
import java.util.Map;

/**
 * APS 高级排产响应 DTO
 *
 * <p>响应内容：排产方案列表 + 每个方案含工厂分配 + 甘特图 + 约束满足情况</p>
 *
 * @author xiaoyun
 * @since 2026-08-01
 */
@Data
public class ApsSchedulingResponse {

    /** 排产方案列表（按优先级排列） */
    private List<ScheduleSolution> solutions;

    /** 求解状态：FEASIBLE=所有订单已分配 / PARTIAL=部分订单未分配 / INFEASIBLE=无可行方案 */
    private String status;

    /** 求解耗时（ms） */
    private long solveTimeMs;

    /** 汇总信息 */
    private Map<String, Object> summary;

    @Data
    public static class ScheduleSolution {
        /** 订单ID */
        private String orderId;
        /** 订单编号 */
        private String orderNo;
        /** 款式编号 */
        private String styleNo;
        /** 订单数量 */
        private int quantity;
        /** 计划交期 */
        private String plannedEndDate;
        /** 优先级：OVERDUE=逾期 / URGENT=紧急(≤7天) / NORMAL=普通 */
        private String priority;
        /** 分配工厂ID（UUID） */
        private String factoryId;
        /** 分配工厂名称 */
        private String factoryName;
        /** 综合评分 0-100 */
        private int matchScore;
        /** 产能分（40%权重） */
        private int capacityScore;
        /** 交期分（30%权重） */
        private int deliveryScore;
        /** 品类分（20%权重） */
        private int categoryScore;
        /** 负载分（10%权重） */
        private int loadScore;
        /** 排产开始日期 */
        private String startDate;
        /** 排产结束日期 */
        private String endDate;
        /** 总工期（天） */
        private int totalDays;
        /** 甘特图工序条目 */
        private List<GanttTask> ganttTasks;
        /** 约束满足状态 */
        private ConstraintStatus constraints;
        /** 瓶颈工序名称 */
        private String bottleneckProcess;
        /** 分配说明 */
        private String explanation;
    }

    @Data
    public static class GanttTask {
        /** 工序名称 */
        private String process;
        /** 工序顺序 */
        private int sequence;
        /** 开始日期 */
        private String startDate;
        /** 结束日期 */
        private String endDate;
        /** 工期（天） */
        private int days;
        /** 工序日产能 */
        private int dailyCapacity;
        /** 是否瓶颈工序 */
        private boolean bottleneck;
    }

    @Data
    public static class ConstraintStatus {
        /** 产能约束是否满足 */
        private boolean capacityMet;
        /** 交期约束是否满足 */
        private boolean deadlineMet;
        /** 工作日历约束是否满足 */
        private boolean calendarMet;
        /** 违反的约束列表 */
        private List<String> violations;
    }
}
