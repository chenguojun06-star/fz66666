package com.fashion.supplychain.intelligence.dto;

import java.util.List;
import lombok.Data;

/**
 * 次品溯源响应 — 按订单聚合各工人的缺陷数据
 */
@Data
public class DefectTraceResponse {
    /** 订单总缺陷数 */
    private int totalDefects;
    /** 订单总扫码数（含成功+失败） */
    private int totalScans;
    /** 订单整体缺陷率 % */
    private double overallDefectRate;
    /** 按工人聚合的缺陷明细 */
    private List<WorkerDefect> workers;
    /** 高频缺陷工序 TOP3 */
    private List<ProcessDefect> hotProcesses;
    /** 最近7天缺陷趋势（按天） */
    private List<DayTrend> trend;

    @Data
    public static class WorkerDefect {
        /** 工人ID */
        private String operatorId;
        /** 工人姓名 */
        private String operatorName;
        /** 缺陷次数 */
        private int defectCount;
        /** 该工人总扫码次数 */
        private int totalScans;
        /** 缺陷率 % */
        private double defectRate;
        /** 该工人最高缺陷工序 */
        private String worstProcess;
        /** 风险等级: low/medium/high */
        private String riskLevel;
    }

    @Data
    public static class ProcessDefect {
        /** 工序名 */
        private String processName;
        /** 缺陷次数 */
        private int defectCount;
        /** 该工序总扫码次数 */
        private int totalScans;
        /** 缺陷率 % */
        private double defectRate;
    }

    @Data
    public static class DayTrend {
        /** 日期 yyyy-MM-dd */
        private String date;
        /** 当日缺陷数 */
        private int defectCount;
        /** 当日总扫码数 */
        private int totalScans;
    }
}
