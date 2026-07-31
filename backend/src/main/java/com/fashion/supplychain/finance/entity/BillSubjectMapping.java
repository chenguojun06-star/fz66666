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
 * 账单分类→会计科目映射实体
 * <p>
 * 9类billCategory的默认借贷科目映射规则，驱动自动生成会计凭证。
 * 关联铁律：P0 #4 多租户隔离 / D-022 财务数据链路闭环
 */
@Data
@EqualsAndHashCode(callSuper = false)
@TableName("t_bill_subject_mapping")
public class BillSubjectMapping extends Model<BillSubjectMapping> {

    @TableId(type = IdType.AUTO)
    private Long id;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    /** PAYABLE=应付 / RECEIVABLE=应收 */
    private String billType;

    /** MATERIAL/PRODUCT/EXTERNAL_FACTORY/PAYROLL/EXPENSE/SHIPMENT/DEDUCTION/INVENTORY_PROFIT/INVENTORY_LOSS */
    private String billCategory;

    /** 可选：特定来源类型（NULL表示通用映射） */
    private String sourceType;

    /** 借方科目编码 */
    private String debitSubjectCode;

    /** 贷方科目编码 */
    private String creditSubjectCode;

    /** CAS=中国会计准则 / ASC606=国际收入准则 */
    private String accountingStandard;

    /** 是否启用：0=禁用 1=启用 */
    private Integer enabled;

    /** 逻辑删除：0=正常 1=已删除 */
    private Integer deleteFlag;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
