package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * D-474：扣款类型配置（管理员设定有哪些扣款项：质量扣款/延期扣款/次品扣款/其他）。
 * 录入扣款时从这里选类型，金额可带默认值或按比例算。
 */
@Data
@TableName("t_deduction_type_config")
public class DeductionTypeConfig {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long tenantId;
    /** 扣款类型编码，如 QUALITY / DELAY / DEFECT / OTHER */
    private String typeCode;
    /** 扣款类型名称，如 质量扣款 / 延期扣款 / 次品扣款 */
    private String typeName;
    /** 适用对象：WORKER=员工, FACTORY=外发工厂, BOTH=两者 */
    private String applyTarget;
    /** 默认扣款金额（录入时带出，可改） */
    private BigDecimal defaultAmount;
    /** 按货款比例扣款(%)，>0 时按 baseAmount 比例算 */
    private BigDecimal deductRatio;
    private Integer sortOrder;
    private String status;
    private Integer deleteFlag;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
