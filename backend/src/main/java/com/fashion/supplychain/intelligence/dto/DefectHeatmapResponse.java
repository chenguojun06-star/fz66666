package com.fashion.supplychain.intelligence.dto;

import java.util.List;
import lombok.Data;

/**
 * 质量缺陷热力图响应 — 工序×工厂缺陷矩阵
 */
@Data
public class DefectHeatmapResponse {
    /** 工序列表（X轴） */
    private List<String> processes;
    /** 工厂列表（Y轴） */
    private List<String> factories;
    /** 热力图数据（factories.size × processes.size） */
    private List<HeatCell> cells;
    /** 缺陷总数 */
    private int totalDefects;
    /** 最高缺陷工序 */
    private String worstProcess;
    /** 最高缺陷工厂 */
    private String worstFactory;

    @Data
    public static class HeatCell {
        /** 工厂索引 */
        private int factoryIdx;
        /** 工序索引 */
        private int processIdx;
        /** 缺陷次数 */
        private int defectCount;
        /** 总扫码次数 */
        private int totalScans;
        /** 缺陷率 % */
        private double defectRate;
        /** 色温等级 0=无缺陷 ~ 4=极高 */
        private int heatLevel;
    }
}
