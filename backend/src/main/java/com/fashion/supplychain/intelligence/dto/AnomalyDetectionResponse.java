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

    /**
     * 今日扫码样本数（数据覆盖度）。
     *
     * <p><b>与 {@link #totalChecked} 的区别</b>：{@code totalChecked} 是「跑了多少项检测规则」，
     * 无论有没有数据规则都会跑完，因此恒大于 0，<b>不能</b>用来判断数据是否存在。
     * 本字段才是「今天实际有多少条记录可供判断」。
     *
     * <p>存在的意义：当天无扫码时，规则会返回「无异常」，
     * 但那是<b>没有数据可判断</b>，不是「生产正常」。
     * 二者在业务上完全不同，缺失不能当成正常结果（CLAUDE.md 铁律 9）。
     */
    private int todaySampleCount;

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
