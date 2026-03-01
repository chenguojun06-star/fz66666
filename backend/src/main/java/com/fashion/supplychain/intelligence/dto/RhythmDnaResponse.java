package com.fashion.supplychain.intelligence.dto;

import java.util.List;
import lombok.Data;

/**
 * 生产节奏DNA响应 — 工序耗时占比基因条形图
 */
@Data
public class RhythmDnaResponse {
    private List<OrderRhythm> orders;

    @Data
    public static class OrderRhythm {
        private String orderId;
        private String orderNo;
        private String styleName;
        /** 总生产天数 */
        private int totalDays;
        /** 各工序节奏段 */
        private List<RhythmSegment> segments;
    }

    @Data
    public static class RhythmSegment {
        /** 工序/阶段名 */
        private String stageName;
        /** 该阶段耗时天数 */
        private double days;
        /** 占比 % */
        private double pct;
        /** 色带颜色 hex */
        private String color;
        /** 是否为瓶颈（耗时>均值 1.5 倍） */
        private boolean bottleneck;
    }
}
