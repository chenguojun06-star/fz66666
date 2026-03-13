package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;

/** 视觉AI分析日志 — 布料缺陷、款式识别、色差检测 */
@Data
@TableName("t_visual_ai_log")
public class VisualAiLog {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String orderId;

    private String imageUrl;

    /** DEFECT_DETECT / STYLE_IDENTIFY / COLOR_CHECK */
    private String taskType;

    /** 检测结果JSON数组 */
    private String detectedItems;

    /** 平均置信度 0-100 */
    private Integer confidence;

    /** NONE / LOW / MEDIUM / HIGH / CRITICAL */
    private String severity;

    /** DONE / FAILED */
    private String status;

    private String operatorId;

    private LocalDateTime createTime;
}
