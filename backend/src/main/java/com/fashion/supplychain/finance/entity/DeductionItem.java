package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import java.math.BigDecimal;
import lombok.Data;

/**
 * 扣款项实体类
 */
@Data
@TableName("t_deduction_item")
public class DeductionItem {

    /**
     * 主键ID
     */
    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    /**
     * 对账ID
     */
    private String reconciliationId;

    /**
     * 扣款类型
     */
    private String deductionType;

    /**
     * 扣款金额
     */
    private BigDecimal deductionAmount;

    /**
     * 描述
     */
    private String description;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;
}
