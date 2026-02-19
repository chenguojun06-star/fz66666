package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 费用报销实体
 * 用于记录员工日常费用报销：打车、出差、面辅料垫付等
 */
@Data
@TableName("t_expense_reimbursement")
public class ExpenseReimbursement {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 报销单号（自动生成 EX+日期+序号） */
    private String reimbursementNo;

    /** 申请人ID */
    private Long applicantId;

    /** 申请人姓名 */
    private String applicantName;

    /** 费用类型：taxi=打车, travel=出差, material_advance=面辅料垫付, office=办公用品, other=其他 */
    private String expenseType;

    /** 报销标题/事由 */
    private String title;

    /** 报销金额 */
    private BigDecimal amount;

    /** 费用发生日期 */
    private LocalDate expenseDate;

    /** 详细说明 */
    private String description;

    /** 关联订单号（面辅料垫付时） */
    private String orderNo;

    /** 供应商ID（关联 t_factory，面辅料垫付时） */
    private String supplierId;

    /** 供应商名称（面辅料垫付时） */
    private String supplierName;

    /** 供应商联系人（面辅料垫付时） */
    private String supplierContactPerson;

    /** 供应商联系电话（面辅料垫付时） */
    private String supplierContactPhone;

    /** 收款账号 */
    private String paymentAccount;

    /** 付款方式：bank_transfer=银行转账, alipay=支付宝, wechat=微信 */
    private String paymentMethod;

    /** 收款户名 */
    private String accountName;

    /** 开户银行 */
    private String bankName;

    /** 附件URL列表（JSON数组） */
    private String attachments;

    /** 状态：pending=待审批, approved=已批准, rejected=已驳回, paid=已付款 */
    private String status;

    /** 审批人ID */
    private Long approverId;

    /** 审批人姓名 */
    private String approverName;

    /** 审批时间 */
    private LocalDateTime approvalTime;

    /** 审批备注/驳回原因 */
    private String approvalRemark;

    /** 付款时间 */
    private LocalDateTime paymentTime;

    /** 付款操作人 */
    private String paymentBy;

    /** 创建时间 */
    private LocalDateTime createTime;

    /** 更新时间 */
    private LocalDateTime updateTime;

    /** 创建人 */
    private String createBy;

    /** 更新人 */
    private String updateBy;

    /** 删除标记 0=正常 1=已删除 */
    private Integer deleteFlag;

    /** 租户ID */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
