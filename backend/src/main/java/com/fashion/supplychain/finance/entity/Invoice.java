package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 发票记录实体
 */
@Data
@TableName("t_invoice")
public class Invoice {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /** 发票号码（INV + 时间戳，自动生成） */
    private String invoiceNo;

    /** 发票类型：NORMAL=增值税普通发票, SPECIAL=增值税专用发票 */
    private String invoiceType;

    /** 购方名称 */
    private String titleName;
    /** 购方税号 */
    private String titleTaxNo;
    /** 购方地址 */
    private String titleAddress;
    /** 购方电话 */
    private String titlePhone;
    /** 购方开户行 */
    private String titleBankName;
    /** 购方银行账号 */
    private String titleBankAccount;

    /** 销方名称（本公司） */
    private String sellerName;
    /** 销方税号 */
    private String sellerTaxNo;

    /** 不含税金额 */
    private BigDecimal amount;
    /** 税率 */
    private BigDecimal taxRate;
    /** 税额 */
    private BigDecimal taxAmount;
    /** 价税合计 */
    private BigDecimal totalAmount;

    /** 关联业务类型：RECONCILIATION / SETTLEMENT / REIMBURSEMENT / ORDER */
    private String relatedBizType;
    /** 关联业务单据ID */
    private String relatedBizId;
    /** 关联单据号 */
    private String relatedBizNo;

    /** 状态：DRAFT / ISSUED / CANCELLED */
    private String status;

    /** 开票日期 */
    private LocalDate issueDate;

    private String remark;
    private Integer deleteFlag;
    private String creatorId;
    private String creatorName;
    private Long tenantId;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
