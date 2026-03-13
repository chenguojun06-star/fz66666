package com.fashion.supplychain.intelligence.dto;

import lombok.Data;

/** Stage7 视觉AI分析请求 */
@Data
public class VisualAIRequest {

    /** 图片URL（COS地址） */
    private String imageUrl;

    /**
     * 任务类型：
     * DEFECT_DETECT  — 布料/成品缺陷检测
     * STYLE_IDENTIFY — 款式特征识别
     * COLOR_CHECK    — 色差/色牢度检查
     */
    private String taskType;

    /** 关联订单ID（可选，用于日志归档） */
    private String orderId;
}
