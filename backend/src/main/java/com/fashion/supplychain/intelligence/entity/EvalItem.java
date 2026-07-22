package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 离线评估数据项（P1-4 Langfuse/Eval 框架方向）
 *
 * <p>用途：数据集内的单条评估项，包含用户问题、AI实际答案、期望答案、评估得分。</p>
 *
 * @author xiaoyun
 * @since 2026-07-22
 */
@Data
@TableName("t_eval_item")
public class EvalItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID（P0铁律4：多租户隔离） */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 数据集ID */
    private Long datasetId;

    /** 会话ID（采样来源） */
    private String sessionId;

    /** 用户问题 */
    private String userMessage;

    /** 期望答案（人工标注） */
    private String expectedAnswer;

    /** AI实际答案 */
    private String actualAnswer;

    /** 评估得分0-100 */
    private BigDecimal score;

    /** 多维度评分JSON */
    private String scoreDimensions;

    /** 评估器名称 */
    private String evaluator;

    /** 是否已评估：0=未评估，1=已评估 */
    private Integer evaluated;

    /** 创建时间 */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
