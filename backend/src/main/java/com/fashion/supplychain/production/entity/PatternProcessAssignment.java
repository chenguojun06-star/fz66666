package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 样板工序指派明细（D-384）
 *
 * 同一道工序（如「车缝」任务量 3 件）可以指派给多个工人（张三 2 件 / 李四 1 件），
 * 每人只报自己那份额度，报工可以一次报完也可以分多次报完（累计到自己的指派数量为止）。
 * 工资按各人实际报工件数 × 工序单价计。
 *
 * 原实现只有一个 receiver 字段（记录级），多人指派会互相覆盖，且无分配留痕。
 */
@Data
@TableName("t_pattern_process_assignment")
public class PatternProcessAssignment {

    @TableId(type = IdType.ASSIGN_ID)
    private String id;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 样板生产记录ID（一个色码一条记录） */
    private String patternProductionId;

    /** 款号（冗余，便于列表展示） */
    private String styleNo;

    /** 颜色（冗余，便于展示） */
    private String color;

    /** 尺码（冗余，便于展示） */
    private String size;

    /** 工序名（子工序，如「车缝」「整件」） */
    private String processName;

    /** 工序编码 / 所属阶段 */
    private String processCode;

    /** 被指派人姓名 */
    private String assignee;

    /** 被指派人ID（若有） */
    private String assigneeId;

    /** 指派数量（该工人负责的件数） */
    private Integer assignmentQuantity;

    /** 指派时的工序单价快照（工资参考） */
    private BigDecimal unitPrice;

    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private String creatorId;

    @TableField(fill = FieldFill.INSERT)
    private String creatorName;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    /** 逻辑删除：0 正常 1 删除 */
    private Integer deleteFlag;
}
