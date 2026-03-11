package com.fashion.supplychain.selection.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 选品评审记录实体
 */
@Data
@TableName("t_selection_review")
public class SelectionReview {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 关联候选款ID */
    private Long candidateId;

    /** 关联批次ID（冗余） */
    private Long batchId;

    /** 评审人ID */
    private String reviewerId;

    /** 评审人姓名 */
    private String reviewerName;

    /** 评分(0-100) */
    private Integer score;

    /**
     * 决策:
     * APPROVE-推荐上样 / REJECT-不推荐 / HOLD-待定
     */
    private String decision;

    /** 评审意见 */
    private String comment;

    /** 多维度评分（JSON: 工艺/成本/趋势/客户需求） */
    private String dimensions;

    /** 评审时间 */
    private LocalDateTime reviewTime;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
