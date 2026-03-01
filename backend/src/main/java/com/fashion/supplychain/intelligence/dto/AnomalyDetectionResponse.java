package com.fashion.supplychain.intelligence.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

/**
 * 异常行为检测响应 DTO
 */
@Data
public class AnomalyDetectionResponse {
    private List<AnomalyItem> anomalies = new ArrayList<>();
    private int totalChecked;

    @Data
    public static class AnomalyItem {
        /** 异常类型：output_spike / quality_spike / idle_worker / night_scan */
        private String type;
        /** 严重等级：critical / warning / info */
        private String severity;
        /** 标题 */
        private String title;
        /** 详细描述 */
        private String description;
        /** 关联对象名称（工人名/工厂名） */
        private String targetName;
        /** 今日数值 */
        private double todayValue;
        /** 历史均值 */
        private double historyAvg;
        /** 偏差倍数 */
        private double deviationRatio;
    }
}
