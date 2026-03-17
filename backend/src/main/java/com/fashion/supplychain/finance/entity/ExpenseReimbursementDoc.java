package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 报销单凭证/附件实体（含AI识别结果）
 * 对应表：t_expense_reimbursement_doc
 */
@Data
@TableName("t_expense_reimbursement_doc")
public class ExpenseReimbursementDoc {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 租户ID */
    private Long tenantId;

    /** 关联的报销单ID（提交报销单后回填） */
    private String reimbursementId;

    /** 关联的报销单号 */
    private String reimbursementNo;

    /** COS图片地址（预签名URL，前端展示用） */
    private String imageUrl;

    /** AI识别原始文本 */
    private String rawText;

    /** AI识别金额 */
    private BigDecimal recognizedAmount;

    /** AI识别日期 YYYY-MM-DD */
    private String recognizedDate;

    /** AI识别事由/描述 */
    private String recognizedTitle;

    /** AI识别费用类型（如 taxi/travel/meal 等） */
    private String recognizedType;

    /** 上传人ID */
    private String uploaderId;

    /** 上传人姓名 */
    private String uploaderName;

    /** 创建时间 */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    /** 软删除标记 0=正常 1=已删除 */
    @TableLogic(value = "0", delval = "1")
    private Integer deleteFlag;
}
