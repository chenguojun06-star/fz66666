package com.fashion.supplychain.intelligence.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 离线评估数据集（P1-4 Langfuse/Eval 框架方向）
 *
 * <p>用途：定时采样历史对话形成数据集，用评估器跑离线评分，
 * 追踪 AI 回答质量趋势、对比模型版本。</p>
 *
 * <p>来源：参考 Langfuse（28.4k star）离线评估 Dataset 概念</p>
 *
 * @author xiaoyun
 * @since 2026-07-22
 */
@Data
@TableName("t_eval_dataset")
public class EvalDataset {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID（P0铁律4：多租户隔离） */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 数据集名称 */
    private String datasetName;

    /** 描述 */
    private String description;

    /** 数据集类型：CONVERSATION/TOOL_CALL/SCAN_FLOW */
    private String datasetType;

    /** 数据项数量 */
    private Integer itemCount;

    /** 创建时间 */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /** 更新时间 */
    private LocalDateTime updateTime;
}
