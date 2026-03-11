package com.fashion.supplychain.selection.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

/**
 * 选品批次实体
 */
@Data
@TableName("t_selection_batch")
public class SelectionBatch {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 批次号 SEL-yyyyMMdd-xxxxx */
    private String batchNo;

    /** 批次名称 */
    private String batchName;

    /** 季节 spring/summer/autumn/winter */
    private String season;

    /** 年份 */
    private Integer year;

    /** 主题/风格方向 */
    private String theme;

    /**
     * 状态:
     * DRAFT-草稿 / REVIEWING-评审中 / APPROVED-已确认 / CLOSED-已归档
     */
    private String status;

    /** 目标选款数量 */
    private Integer targetQty;

    /** 已确认款式数量 */
    private Integer finalizedQty;

    private String remark;

    private String createdById;
    private String createdByName;
    private String approvedById;
    private String approvedByName;
    private LocalDateTime approvedTime;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    private Integer deleteFlag;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
