package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 样板生产实体
 */
@Data
@TableName("t_pattern_production")
public class PatternProduction {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    /**
     * 款号ID
     */
    private String styleId;

    /**
     * 款号
     */
    private String styleNo;

    /**
     * 颜色
     */
    private String color;

    /**
     * 数量（样板件数）
     */
    private Integer quantity;

    /**
     * 下板时间
     */
    private LocalDateTime releaseTime;

    /**
     * 交板时间（预计）
     */
    private LocalDateTime deliveryTime;

    /**
     * 领取人
     */
    private String receiver;

    /**
     * 领取时间
     */
    private LocalDateTime receiveTime;

    /**
     * 完成时间
     */
    private LocalDateTime completeTime;

    /**
     * 纸样师傅
     */
    private String patternMaker;

    /**
     * 工序进度（JSON格式）
     * 例如：{"cutting": 100, "sewing": 80, "ironing": 50}
     */
    private String progressNodes;

    /**
     * 状态：PENDING(待领取), IN_PROGRESS(制作中), COMPLETED(已完成)
     */
    private String status;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;

    /**
     * 创建人
     */
    private String createBy;

    /**
     * 更新人
     */
    private String updateBy;

    /**
     * 删除标记（0=未删除，1=已删除）
     */
    private Integer deleteFlag;

    /**
     * 维护人
     */
    private String maintainer;

    /**
     * 维护时间
     */
    private LocalDateTime maintainTime;

    // ==================== 操作人字段（自动填充）====================

    private String receiverId;

    private String patternMakerId;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
