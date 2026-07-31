package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.activerecord.Model;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * 会计科目实体（CAS 中国会计准则基础科目）
 * <p>
 * 关联铁律：P0 #4 多租户隔离 / D-022 财务数据链路闭环
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("t_account_subject")
public class AccountSubject extends Model<AccountSubject> {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 租户ID */
    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** 科目编码（如1001、2202、6001） */
    private String subjectCode;

    /** 科目名称 */
    private String subjectName;

    /** ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE */
    private String subjectType;

    /** DEBIT/CREDIT */
    private String balanceDirection;

    /** 父科目编码 */
    private String parentCode;

    /** 是否末级科目：0=否 1=是 */
    private Integer isLeaf;

    /** 是否启用：0=禁用 1=启用 */
    private Integer enabled;

    /** 逻辑删除：0=正常 1=已删除 */
    private Integer deleteFlag;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
