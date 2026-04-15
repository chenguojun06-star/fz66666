package com.fashion.supplychain.intelligence.dto;

import lombok.Data;
import java.util.List;

/** Stage7 视觉AI分析响应 */
@Data
public class VisualAIResponse {

    private String taskType;

    /** NONE / LOW / MEDIUM / HIGH / CRITICAL */
    private String severity;

    /** 整体置信度 0-100 */
    private Integer confidence;

    /** 检测到的缺陷/特征列表 */
    private List<DetectedItem> detectedItems;

    /** AI生成的文字分析报告 */
    private String report;

    /** 推荐处理方式 */
    private String recommendation;

    /** 日志ID（可用于跟踪） */
    private Long logId;

    /** 数据来源：ai_vision=AI视觉分析, ai_no_image=AI无图推理 */
    private String dataSource;

    @Data
    public static class DetectedItem {
        /** 缺陷/特征类型（破洞/色差/起球/尺寸偏大 等） */
        private String type;

        /** 具体描述 */
        private String description;

        /** 置信度 0-100 */
        private Integer confidence;

        /** 严重等级：LOW/MEDIUM/HIGH */
        private String level;

        /**
         * 位置描述（如: 左前身中部），或坐标JSON
         * {x: 0.3, y: 0.5, w: 0.1, h: 0.08} (相对比例)
         */
        private String location;
    }
}
