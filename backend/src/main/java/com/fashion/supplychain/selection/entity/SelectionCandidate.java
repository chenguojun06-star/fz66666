package com.fashion.supplychain.selection.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 选品候选款实体
 */
@Data
@TableName("t_selection_candidate")
public class SelectionCandidate {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 关联批次ID */
    private Long batchId;

    /** 候选款编号 CAND-xxxxx */
    private String candidateNo;

    /** 款式名称 */
    private String styleName;

    /** 品类 */
    private String category;

    /** 主色系描述 */
    private String colorFamily;

    /** 面料类型 */
    private String fabricType;

    /**
     * 来源类型:
     * INTERNAL-自主开发 / SUPPLIER-供应商 / CLIENT-客户定制
     */
    private String sourceType;

    /** 来源描述 */
    private String sourceDesc;

    /** 参考图片URL列表（JSON数组） */
    private String referenceImages;

    /** 预估成本 */
    private BigDecimal costEstimate;

    /** 目标报价 */
    private BigDecimal targetPrice;

    /** 预计下单数量 */
    private Integer targetQty;

    /**
     * 状态:
     * PENDING-待评审 / APPROVED-已通过 / REJECTED-已拒绝 / HOLD-待定
     */
    private String status;

    /** AI趋势契合分(0-100) */
    private Integer trendScore;

    /** AI打分依据 */
    private String trendScoreReason;

    /** 预估利润率(%) */
    private BigDecimal profitEstimate;

    /** 适合季节标签（JSON） */
    private String seasonTags;

    /** 风格标签（JSON） */
    private String styleTags;

    /** 平均评审分 */
    private BigDecimal avgReviewScore;

    /** 参与评审人数 */
    private Integer reviewCount;

    /** 拒绝原因 */
    private String rejectReason;

    /** 审批通过后创建的StyleInfo ID */
    private Long createdStyleId;

    /** 关联款号 */
    private String createdStyleNo;

    private String remark;
    private String createdById;
    private String createdByName;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
