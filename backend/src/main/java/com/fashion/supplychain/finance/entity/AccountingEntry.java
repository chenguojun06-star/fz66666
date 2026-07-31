package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.activerecord.Model;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 会计分录行实体
 * <p>
 * 每张凭证包含2行分录（借方+贷方），借贷必须平衡。
 * 关联铁律：P0 #4 多租户隔离 / D-022 财务数据链路闭环
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("t_accounting_entry")
public class AccountingEntry extends Model<AccountingEntry> {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 凭证ID */
    private Long voucherId;

    /** 行号 */
    private Integer lineNo;

    /** 科目编码 */
    private String subjectCode;

    /** 科目名称（冗余） */
    private String subjectName;

    /** 借方金额 */
    private BigDecimal debitAmount;

    /** 贷方金额 */
    private BigDecimal creditAmount;

    /** 摘要 */
    private String summary;

    /** 逻辑删除：0=正常 1=已删除 */
    private Integer deleteFlag;

    private LocalDateTime createTime;
}
