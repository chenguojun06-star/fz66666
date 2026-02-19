package com.fashion.supplychain.production.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 纸样修改记录实体
 *
 * 功能说明：
 * - 独立记录纸样的修改历史
 * - 不影响样板生产（PatternProduction）数据
 * - 支持完整的审批流程
 * - 记录修改前后对比
 */
@Data
@TableName("t_pattern_revision")
public class PatternRevision {

    /**
     * 主键ID
     */
    @TableId(type = IdType.ASSIGN_UUID)
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
     * 修改版本号（如：V1.0, V1.1, V2.0）
     */
    private String revisionNo;

    /**
     * 修改类型：MINOR(小改), MAJOR(大改), URGENT(紧急修改)
     */
    private String revisionType;

    /**
     * 修改原因
     */
    private String revisionReason;

    /**
     * 修改内容详情
     */
    private String revisionContent;

    /**
     * 修改前信息（JSON格式）
     */
    private String beforeChanges;

    /**
     * 修改后信息（JSON格式）
     */
    private String afterChanges;

    /**
     * 附件URL列表（JSON数组格式）
     */
    private String attachmentUrls;

    /**
     * 状态：DRAFT(草稿), SUBMITTED(已提交), APPROVED(已审核), REJECTED(已拒绝), COMPLETED(已完成)
     */
    private String status;

    /**
     * 修改日期
     */
    private LocalDate revisionDate;

    /**
     * 预计完成日期
     */
    private LocalDate expectedCompleteDate;

    /**
     * 实际完成日期
     */
    private LocalDate actualCompleteDate;

    /**
     * 维护人ID
     */
    @TableField(fill = FieldFill.INSERT)
    private String maintainerId;

    /**
     * 维护人姓名
     */
    @TableField(fill = FieldFill.INSERT)
    private String maintainerName;

    /**
     * 维护时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime maintainTime;

    /**
     * 提交人ID
     */
    private String submitterId;

    /**
     * 提交人姓名
     */
    private String submitterName;

    /**
     * 提交时间
     */
    private LocalDateTime submitTime;

    /**
     * 审核人ID
     */
    private String approverId;

    /**
     * 审核人姓名
     */
    private String approverName;

    /**
     * 审核时间
     */
    private LocalDateTime approvalTime;

    /**
     * 审核意见
     */
    private String approvalComment;

    /**
     * 纸样师傅ID
     */
    private String patternMakerId;

    /**
     * 纸样师傅姓名
     */
    private String patternMakerName;

    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
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
     * 备注
     */
    private String remark;

    /**
     * 工厂ID（多工厂隔离）
     */
    private String factoryId;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
