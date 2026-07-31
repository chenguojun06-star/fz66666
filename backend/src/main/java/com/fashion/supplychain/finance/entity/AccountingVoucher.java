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
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 会计凭证头实体
 * <p>
 * 从账单（BillAggregation）自动生成的会计凭证，借贷必须平衡。
 * 关联铁律：P0 #2 事务边界 / P0 #4 多租户隔离 / D-022 财务数据链路闭环
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("t_accounting_voucher")
public class AccountingVoucher extends Model<AccountingVoucher> {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 凭证编号 */
    private String voucherNo;

    /** 凭证日期 */
    private LocalDate voucherDate;

    /** 关联账单ID（BillAggregation.id，VARCHAR(64)） */
    private String billAggregationId;

    /** 来源类型 */
    private String sourceType;

    /** 来源ID */
    private String sourceId;

    /** 摘要 */
    private String summary;

    /** 合计金额 */
    private BigDecimal totalAmount;

    /** JOURNAL=记账 / REVERSAL=冲销 */
    private String voucherType;

    /** DRAFT=草稿 / POSTED=已过账 / REVERSED=已冲销 */
    private String status;

    /** 冲销凭证ID */
    private Long reverseVoucherId;

    /** CAS / ASC606 */
    private String accountingStandard;

    /** 创建人 */
    private String createBy;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;

    /** 逻辑删除：0=正常 1=已删除 */
    private Integer deleteFlag;
}
