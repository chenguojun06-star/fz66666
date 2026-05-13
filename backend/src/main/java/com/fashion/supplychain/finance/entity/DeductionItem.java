package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
@TableName("t_deduction_item")
public class DeductionItem {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private String reconciliationId;

    private String settlementId;

    private String deductionType;

    private BigDecimal deductionAmount;

    private String description;

    private String sourceType;

    private String sourceId;

    @TableField(fill = FieldFill.INSERT)
    private Long tenantId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
